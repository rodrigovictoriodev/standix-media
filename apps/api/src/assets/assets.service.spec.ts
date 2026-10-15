import { BadRequestException, ConflictException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaProcessingService } from "../media/media-processing.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";
import { AssetsService } from "./assets.service";

const blob = {
  id: "blob-1",
  sha256: "abc123",
  mimeType: "image/png",
  sizeBytes: BigInt(18),
  storageBucket: "standix-media",
  storageKey: "sha256/ab/abc123",
  thumbnailKey: null as string | null,
};

const assetRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "asset-1",
  teamId: "team-1",
  ownerId: "user-1",
  folderId: null,
  blobId: "blob-1",
  filename: "upload-482.png",
  displayName: "upload-482.png",
  kind: "IMAGE",
  isFavorite: false,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  metadata: {},
  tags: [],
  folder: null,
  blob,
  ...overrides,
});

describe("AssetsService", () => {
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    mediaBlob: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    asset: {
      create: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    slide: { findMany: vi.fn() },
    scene: { findMany: vi.fn() },
    audioCue: { findMany: vi.fn() },
    videoCue: { findMany: vi.fn() },
    assetFolder: {
      create: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const storage = {
    bucket: "standix-media",
    signedUrlTtlSeconds: 900,
    putObject: vi.fn(),
    removeObject: vi.fn(),
    signedUrl: vi.fn(),
  };
  const media = { process: vi.fn() };

  const createService = () =>
    new AssetsService(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
      media as unknown as MediaProcessingService,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === "function" ? arg(prisma) : Promise.all(arg as unknown[]),
    );
    storage.signedUrl.mockResolvedValue("https://media.test/signed");
    media.process.mockResolvedValue({
      metadata: { width: 2, height: 1, resolution: "2x1" },
      thumbnail: Buffer.from("thumb"),
    });
    for (const model of [prisma.slide, prisma.scene, prisma.audioCue, prisma.videoCue]) {
      model.findMany.mockResolvedValue([]);
    }
  });

  it("stores identical uploads once and only adds asset references", async () => {
    const service = createService();
    const file = {
      originalname: "sample.png",
      mimetype: "image/png",
      buffer: Buffer.from("hello-image-data"),
      size: 16,
    } as Express.Multer.File;

    prisma.mediaBlob.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...blob, thumbnailKey: "thumbnails/x.webp" });
    prisma.mediaBlob.create.mockResolvedValue(blob);
    prisma.mediaBlob.update.mockResolvedValue({
      ...blob,
      thumbnailKey: "thumbnails/x.webp",
    });
    prisma.asset.create.mockResolvedValue(assetRecord());

    await service.create("team-1", "user-1", file);
    await service.create("team-1", "user-1", file);

    // Original + thumbnail written once; the second upload only adds a row.
    expect(storage.putObject).toHaveBeenCalledTimes(2);
    expect(prisma.mediaBlob.create).toHaveBeenCalledTimes(1);
    expect(prisma.asset.create).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("renames and moves without touching the physical filename", async () => {
    const service = createService();
    prisma.asset.findFirst.mockResolvedValue(assetRecord());
    prisma.assetFolder.findFirst.mockResolvedValue({ id: "folder-1" });
    prisma.asset.update.mockResolvedValue(
      assetRecord({
        displayName: "Abertura",
        folderId: "folder-1",
        folder: { id: "folder-1", name: "Vídeos", parentId: null },
      }),
    );

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
      filename: "upload-482.png",
      folderId: "folder-1",
    });
  });

  it("refuses to permanently delete an asset that is still referenced", async () => {
    const service = createService();
    prisma.asset.findFirst.mockResolvedValue(
      assetRecord({ deletedAt: new Date() }),
    );
    prisma.audioCue.findMany.mockResolvedValue([
      { id: "cue-1", name: "Vinheta", updatedAt: new Date(), bank: null },
    ]);

    await expect(service.deleteAsset("team-1", "asset-1")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.asset.delete).not.toHaveBeenCalled();
    expect(storage.removeObject).not.toHaveBeenCalled();
  });

  it("removes the object and thumbnail when the last reference is deleted", async () => {
    const service = createService();
    prisma.asset.findFirst.mockResolvedValue(
      assetRecord({
        deletedAt: new Date(),
        blob: { ...blob, thumbnailKey: "thumbnails/ab/abc123.webp" },
      }),
    );
    prisma.asset.count.mockResolvedValue(0);

    await service.deleteAsset("team-1", "asset-1");

    expect(prisma.mediaBlob.delete).toHaveBeenCalledWith({
      where: { id: "blob-1" },
    });
    expect(storage.removeObject).toHaveBeenCalledWith(
      "standix-media",
      "sha256/ab/abc123",
    );
    expect(storage.removeObject).toHaveBeenCalledWith(
      "standix-media",
      "thumbnails/ab/abc123.webp",
    );
  });

  it("lists slide, scene and cue references, one entry per presentation", async () => {
    const service = createService();
    const updatedAt = new Date("2026-10-01T12:00:00.000Z");
    prisma.slide.findMany.mockResolvedValue([
      { orderIndex: 0, presentation: { id: "p-1", title: "Abertura", updatedAt } },
      { orderIndex: 2, presentation: { id: "p-1", title: "Abertura", updatedAt } },
    ]);
    prisma.videoCue.findMany.mockResolvedValue([
      { id: "v-1", name: "Intro", updatedAt, event: { name: "Congresso" } },
    ]);

    const references = await service.getAssetReferences("team-1", "asset-1");

    expect(references).toEqual([
      expect.objectContaining({ type: "slide", id: "p-1", context: "Slide 1, Slide 3" }),
      expect.objectContaining({ type: "videoCue", id: "v-1", context: "Congresso" }),
    ]);
  });

  it("does not move a folder into its own subtree", async () => {
    const service = createService();
    prisma.assetFolder.findFirst.mockResolvedValue({ id: "a", teamId: "team-1" });
    prisma.assetFolder.findMany.mockResolvedValue([
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
    ]);

    await expect(
      service.updateFolder("team-1", "a", { parentId: "c" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.assetFolder.update).not.toHaveBeenCalled();
  });

  it("only deletes empty folders", async () => {
    const service = createService();
    prisma.assetFolder.findFirst.mockResolvedValue({ id: "a", teamId: "team-1" });
    prisma.assetFolder.count.mockResolvedValue(0);
    prisma.asset.count.mockResolvedValue(3);

    await expect(service.deleteFolder("team-1", "a")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.assetFolder.delete).not.toHaveBeenCalled();
  });

  it("includes subfolders when filtering by folder", async () => {
    const service = createService();
    prisma.assetFolder.findMany.mockResolvedValue([
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
      { id: "d", parentId: null },
    ]);
    prisma.asset.findMany.mockResolvedValue([]);

    await service.listAssets("team-1", { folderId: "a", includeSubfolders: true });

    const where = prisma.asset.findMany.mock.calls[0][0].where;
    expect(new Set(where.folderId.in)).toEqual(new Set(["a", "b", "c"]));
  });
});
