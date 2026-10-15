import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AssetsService } from "./assets.service";

const storageMock = {
  bucketExists: vi.fn(),
  makeBucket: vi.fn(),
  putObject: vi.fn(),
  removeObject: vi.fn(),
};

vi.mock("minio", () => ({
  Client: class MockMinioClient {
    bucketExists = storageMock.bucketExists;
    makeBucket = storageMock.makeBucket;
    putObject = storageMock.putObject;
    removeObject = storageMock.removeObject;
  },
}));

describe("AssetsService deduplication", () => {
  const prisma = {
    mediaBlob: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    asset: {
      create: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    slide: {
      findMany: vi.fn(),
    },
    scene: {
      findMany: vi.fn(),
    },
    assetTag: {
      upsert: vi.fn(),
    },
    assetFolder: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  };

  const createService = () =>
    new AssetsService(
      prisma as unknown as PrismaService,
      new ConfigService({
        MINIO_ENDPOINT: "localhost",
        MINIO_PORT: "9000",
        MINIO_USE_SSL: "false",
        MINIO_ACCESS_KEY: "minio",
        MINIO_SECRET_KEY: "minio123",
        MINIO_BUCKET: "standix-media",
      }),
    );

  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.bucketExists.mockResolvedValue(false);
    storageMock.makeBucket.mockResolvedValue(undefined);
    storageMock.putObject.mockResolvedValue(undefined);
    storageMock.removeObject.mockResolvedValue(undefined);
  });

  it("reuses the same blob for identical uploads and only creates the asset reference", async () => {
    const service = createService();

    const file = {
      originalname: "sample.mp4",
      mimetype: "video/mp4",
      buffer: Buffer.from("hello-video-data"),
      size: 18,
    } as Express.Multer.File;

    prisma.mediaBlob.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "blob-1",
        sha256: "abc123",
        mimeType: "video/mp4",
        sizeBytes: BigInt(18),
        storageBucket: "standix-media",
        storageKey: "sha256/ab/abc123",
      });
    prisma.mediaBlob.create.mockResolvedValue({
      id: "blob-1",
      sha256: "abc123",
      mimeType: "video/mp4",
      sizeBytes: BigInt(18),
      storageBucket: "standix-media",
      storageKey: "sha256/ab/abc123",
    });
    prisma.asset.create.mockResolvedValue({
      id: "asset-1",
      teamId: "team-1",
      ownerId: "user-1",
      folderId: null,
      filename: "sample.mp4",
      kind: "VIDEO",
      isFavorite: false,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: { sha256: "abc123", sizeBytes: 18 },
      tags: [],
      folder: null,
      blob: {
        id: "blob-1",
        sha256: "abc123",
        mimeType: "video/mp4",
        sizeBytes: BigInt(18),
        storageBucket: "standix-media",
        storageKey: "sha256/ab/abc123",
      },
    });

    await service.create("team-1", "user-1", file);
    await service.create("team-1", "user-1", file);

    expect(storageMock.putObject).toHaveBeenCalledTimes(1);
    expect(prisma.mediaBlob.create).toHaveBeenCalledTimes(1);
    expect(prisma.asset.create).toHaveBeenCalledTimes(2);
  });

  it("updates the friendly name and folder without changing the physical filename", async () => {
    const service = createService();
    const existing = {
      id: "asset-1",
      teamId: "team-1",
      filename: "upload-482.mp4",
      displayName: "upload-482.mp4",
      folderId: null,
      deletedAt: null,
    };
    prisma.asset.findFirst.mockResolvedValue(existing);
    prisma.assetFolder.findFirst.mockResolvedValue({ id: "folder-1" });
    prisma.asset.update.mockResolvedValue({
      ...existing,
      displayName: "Abertura",
      folderId: "folder-1",
      folder: { id: "folder-1", name: "Vídeos", parentId: null },
      tags: [],
      blob: null,
      metadata: {},
      kind: "VIDEO",
      isFavorite: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const updated = await service.updateAsset("team-1", "asset-1", {
      displayName: " Abertura ",
      folderId: "folder-1",
    });

    expect(prisma.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { displayName: "Abertura", folderId: "folder-1" },
      }),
    );
    expect(updated).toMatchObject({
      displayName: "Abertura",
      filename: "upload-482.mp4",
      folderId: "folder-1",
    });
  });

  it("returns each presentation that uses the asset only once", async () => {
    const service = createService();
    const updatedAt = new Date("2026-10-01T12:00:00.000Z");
    prisma.asset.findFirst.mockResolvedValue({
      id: "asset-1",
      teamId: "team-1",
    });
    prisma.slide.findMany.mockResolvedValue([
      { presentation: { id: "presentation-1", title: "Abertura", updatedAt } },
    ]);
    prisma.scene.findMany.mockResolvedValue([
      { presentation: { id: "presentation-1", title: "Abertura", updatedAt } },
      {
        presentation: {
          id: "presentation-2",
          title: "Encerramento",
          updatedAt,
        },
      },
    ]);

    const usage = await service.getAssetUsage("team-1", "asset-1");

    expect(usage).toHaveLength(2);
    expect(usage.map(({ id }) => id)).toEqual([
      "presentation-1",
      "presentation-2",
    ]);
  });
});
