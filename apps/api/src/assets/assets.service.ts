import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AssetKind, Prisma } from "@prisma/client";
import { Client as MinioClient } from "minio";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { PrismaService } from "../prisma/prisma.service";
import { createPublicStorageClient } from "./public-storage";

const execFileAsync = promisify(execFile);

type AssetWithDetails = Prisma.AssetGetPayload<{
  include: { blob: true; folder: true; tags: true };
}>;

@Injectable()
export class AssetsService {
  private readonly storage: MinioClient;
  private readonly publicStorage: MinioClient;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.storage = new MinioClient({
      endPoint: config.get<string>("MINIO_ENDPOINT") ?? "localhost",
      port: Number(config.get<string>("MINIO_PORT") ?? "9000"),
      useSSL: config.get<string>("MINIO_USE_SSL") === "true",
      accessKey: config.getOrThrow<string>("MINIO_ACCESS_KEY"),
      secretKey: config.getOrThrow<string>("MINIO_SECRET_KEY"),
    });
    this.publicStorage = createPublicStorageClient(config, this.storage);
    this.bucket = config.get<string>("MINIO_BUCKET") ?? "standix-media";
  }

  async create(
    teamId: string,
    ownerId: string,
    file: Express.Multer.File,
    options?: { folderId?: string; tags?: string[] },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("The uploaded file is empty");
    }

    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const key = `sha256/${sha256.slice(0, 2)}/${sha256}`;
    const metadata = await this.extractFileMetadata(file, sha256);

    let blob = await this.prisma.mediaBlob.findUnique({ where: { sha256 } });
    if (!blob) {
      await this.ensureBucket();
      await this.storage.putObject(this.bucket, key, file.buffer, file.size, {
        "Content-Type": file.mimetype,
      });
      try {
        blob = await this.prisma.mediaBlob.create({
          data: {
            sha256,
            mimeType: file.mimetype,
            sizeBytes: BigInt(file.size),
            storageBucket: this.bucket,
            storageKey: key,
          },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        ) {
          throw error;
        }
        blob = await this.prisma.mediaBlob.findUnique({ where: { sha256 } });
        if (!blob) throw error;
      }
    }

    const asset = await this.prisma.asset.create({
      data: {
        teamId,
        ownerId,
        filename: file.originalname,
        displayName: file.originalname,
        kind: this.assetKind(file.mimetype),
        folderId: options?.folderId || null,
        blobId: blob.id,
        metadata,
      },
      include: {
        blob: true,
        folder: true,
        tags: true,
      },
    });

    if (options?.tags?.length) {
      await this.attachTags(teamId, asset.id, options.tags);
      return this.serializeAsset({
        ...asset,
        tags: await this.prisma.asset
          .findUnique({
            where: { id: asset.id },
            include: { blob: true, folder: true, tags: true },
          })
          .then((item) => item?.tags ?? []),
      });
    }

    return this.serializeAsset(asset);
  }

  async listAssets(
    teamId: string,
    filters: {
      folderId?: string;
      search?: string;
      favorite?: boolean;
      trashed?: boolean;
      kind?: AssetKind;
    } = {},
  ) {
    const where: Prisma.AssetWhereInput = {
      teamId,
      deletedAt:
        filters.trashed === true
          ? { not: null }
          : filters.trashed === false
            ? null
            : undefined,
      isFavorite: filters.favorite === true ? true : undefined,
      folderId: filters.folderId ?? undefined,
      kind: filters.kind ?? undefined,
      ...(filters.search
        ? {
            OR: [
              {
                displayName: {
                  contains: filters.search,
                  mode: "insensitive",
                },
              },
              { filename: { contains: filters.search, mode: "insensitive" } },
              {
                tags: {
                  some: {
                    name: { contains: filters.search, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const assets = await this.prisma.asset.findMany({
      where,
      include: { blob: true, folder: true, tags: true },
      orderBy: { createdAt: "desc" },
    });

    return assets.map((item) => this.serializeAsset(item));
  }

  async getDownloadUrl(teamId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, teamId },
      include: { blob: true },
    });
    if (!asset) throw new NotFoundException("Asset not found");

    const url = await this.publicStorage.presignedGetObject(
      asset.blob.storageBucket,
      asset.blob.storageKey,
      15 * 60,
      { "response-content-type": asset.blob.mimeType },
    );
    return { url, expiresInSeconds: 15 * 60 };
  }

  async createFolder(teamId: string, name: string, parentId?: string) {
    const normalized = name.trim();
    if (!normalized) {
      throw new BadRequestException("Folder name is required");
    }

    if (parentId) {
      const parent = await this.prisma.assetFolder.findUnique({
        where: { id: parentId },
      });
      if (!parent || parent.teamId !== teamId) {
        throw new NotFoundException("Parent folder not found for this team");
      }
    }

    return this.prisma.assetFolder.create({
      data: {
        teamId,
        name: normalized,
        parentId: parentId || null,
      },
    });
  }

  async listFolders(teamId: string, parentId?: string) {
    return this.prisma.assetFolder.findMany({
      where: {
        teamId,
        ...(parentId !== undefined ? { parentId } : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  async getAssetUsage(teamId: string, assetId: string) {
    await this.getTeamAsset(teamId, assetId);
    const [slides, scenes] = await Promise.all([
      this.prisma.slide.findMany({
        where: { assetId, presentation: { teamId } },
        select: {
          presentation: { select: { id: true, title: true, updatedAt: true } },
        },
      }),
      this.prisma.scene.findMany({
        where: {
          assetId,
          presentationId: { not: null },
          presentation: { teamId },
        },
        select: {
          presentation: { select: { id: true, title: true, updatedAt: true } },
        },
      }),
    ]);
    const presentations = new Map<
      string,
      { id: string; title: string; updatedAt: Date }
    >();
    for (const item of [...slides, ...scenes]) {
      if (item.presentation) {
        presentations.set(item.presentation.id, item.presentation);
      }
    }
    return [...presentations.values()].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
    );
  }

  async updateAsset(
    teamId: string,
    assetId: string,
    input: { displayName?: string; folderId?: string | null },
  ) {
    const asset = await this.getTeamAsset(teamId, assetId);
    if (asset.deletedAt) {
      throw new BadRequestException("Restore the asset before editing it");
    }

    const displayName = input.displayName?.trim();
    if (input.displayName !== undefined && !displayName) {
      throw new BadRequestException("Asset name is required");
    }

    const folderId = input.folderId;
    if (folderId) {
      const folder = await this.prisma.assetFolder.findFirst({
        where: { id: folderId, teamId },
        select: { id: true },
      });
      if (!folder) {
        throw new NotFoundException("Folder not found for this team");
      }
    }

    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(folderId !== undefined ? { folderId } : {}),
      },
      include: { blob: true, folder: true, tags: true },
    });
    return this.serializeAsset(updated);
  }

  async toggleFavorite(teamId: string, assetId: string) {
    const asset = await this.getTeamAsset(teamId, assetId);
    return this.prisma.asset
      .update({
        where: { id: assetId },
        data: { isFavorite: !asset.isFavorite },
        include: { blob: true, folder: true, tags: true },
      })
      .then((item) => this.serializeAsset(item));
  }

  async trashAsset(teamId: string, assetId: string) {
    const asset = await this.getTeamAsset(teamId, assetId);
    if (asset.deletedAt) {
      return this.serializeAsset(asset);
    }
    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: { deletedAt: new Date() },
      include: { blob: true, folder: true, tags: true },
    });
    return this.serializeAsset(updated);
  }

  async restoreAsset(teamId: string, assetId: string) {
    await this.getTeamAsset(teamId, assetId);
    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: { deletedAt: null },
      include: { blob: true, folder: true, tags: true },
    });
    return this.serializeAsset(updated);
  }

  async deleteAsset(teamId: string, assetId: string) {
    const asset = await this.getTeamAsset(teamId, assetId, true);
    if (!asset.deletedAt) {
      throw new BadRequestException(
        "Move the asset to the trash before deleting it",
      );
    }
    await this.prisma.asset.delete({ where: { id: assetId } });

    const blobUsages = await this.prisma.asset.count({
      where: { blobId: asset.blobId },
    });

    if (blobUsages === 0) {
      await this.storage.removeObject(
        asset.blob.storageBucket,
        asset.blob.storageKey,
      );
      await this.prisma.mediaBlob.delete({ where: { id: asset.blobId } });
    }

    return { id: assetId, deleted: true };
  }

  private async attachTags(
    teamId: string,
    assetId: string,
    tagNames: string[],
  ) {
    const normalized = [
      ...new Set(tagNames.map((tag) => tag.trim()).filter(Boolean)),
    ];
    if (!normalized.length) return;

    const tags = await Promise.all(
      normalized.map(async (tag) =>
        this.prisma.assetTag.upsert({
          where: { teamId_name: { teamId, name: tag } },
          update: {},
          create: { teamId, name: tag },
        }),
      ),
    );

    await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        tags: {
          connect: tags.map((tag) => ({ id: tag.id })),
        },
      },
    });
  }

  private async getTeamAsset(
    teamId: string,
    assetId: string,
    includeBlob = false,
  ) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, teamId },
      include: includeBlob
        ? { blob: true, folder: true, tags: true }
        : { blob: true, folder: true, tags: true },
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    return asset;
  }

  private async ensureBucket() {
    const exists = await this.storage
      .bucketExists(this.bucket)
      .catch(() => false);
    if (!exists) {
      await this.storage.makeBucket(this.bucket, "us-east-1");
    }
  }

  private assetKind(mimeType: string): AssetKind {
    if (mimeType.startsWith("image/")) return "IMAGE";
    if (mimeType.startsWith("video/")) return "VIDEO";
    if (mimeType.startsWith("audio/")) return "AUDIO";
    if (
      mimeType === "application/pdf" ||
      mimeType.includes("presentation") ||
      mimeType.includes("document")
    ) {
      return "DOCUMENT";
    }
    return "OTHER";
  }

  private serializeAsset(asset: AssetWithDetails) {
    const metadata =
      typeof asset.metadata === "object" &&
      asset.metadata !== null &&
      !Array.isArray(asset.metadata)
        ? asset.metadata
        : {};
    return {
      id: asset.id,
      teamId: asset.teamId,
      ownerId: asset.ownerId,
      folderId: asset.folderId,
      filename: asset.filename,
      displayName: asset.displayName || asset.filename,
      kind: asset.kind,
      isFavorite: asset.isFavorite,
      deletedAt: asset.deletedAt,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      metadata: {
        ...metadata,
        sizeBytes: Number(metadata.sizeBytes ?? asset.blob?.sizeBytes ?? 0),
      },
      tags: asset.tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
      })),
      folder: asset.folder
        ? {
            id: asset.folder.id,
            name: asset.folder.name,
            parentId: asset.folder.parentId,
          }
        : null,
      blob: asset.blob
        ? {
            id: asset.blob.id,
            sha256: asset.blob.sha256,
            mimeType: asset.blob.mimeType,
            sizeBytes: Number(asset.blob.sizeBytes),
            storageBucket: asset.blob.storageBucket,
            storageKey: asset.blob.storageKey,
          }
        : null,
    };
  }

  private async extractFileMetadata(file: Express.Multer.File, sha256: string) {
    const base: Record<string, string | number | null> = {
      sha256,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      originalName: file.originalname,
      codec: null,
      durationSeconds: null,
      resolution: null,
      width: null,
      height: null,
    };

    if (file.mimetype.startsWith("image/")) {
      const dims = this.readImageDimensions(file.buffer);
      if (dims) {
        base.resolution = `${dims.width}x${dims.height}`;
        base.width = dims.width;
        base.height = dims.height;
      }
      return base;
    }

    if (
      file.mimetype.startsWith("video/") ||
      file.mimetype.startsWith("audio/")
    ) {
      const probe = await this.readMediaProbe(file);
      if (probe) {
        const videoStream = probe.video?.[0] ?? null;
        const audioStream = probe.audio?.[0] ?? null;
        const codec =
          videoStream?.codec_name ?? audioStream?.codec_name ?? null;
        const duration = Number(
          probe.format?.duration ??
            audioStream?.duration ??
            videoStream?.duration ??
            0,
        );
        const width = Number(videoStream?.width ?? 0) || null;
        const height = Number(videoStream?.height ?? 0) || null;

        if (width && height) {
          base.resolution = `${width}x${height}`;
          base.width = width;
          base.height = height;
        }
        if (codec) base.codec = codec;
        if (duration > 0) base.durationSeconds = duration;
      }
    }

    return base;
  }

  private readImageDimensions(buffer: Buffer) {
    if (buffer.length >= 24 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset + 12 < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          return {
            width: buffer.readUInt16BE(offset + 7),
            height: buffer.readUInt16BE(offset + 5),
          };
        }
        const blockLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + blockLength;
      }
    }

    if (
      buffer.length >= 24 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return {
        width: buffer.readUInt32BE(8),
        height: buffer.readUInt32BE(12),
      };
    }

    if (
      buffer.length >= 10 &&
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46
    ) {
      return {
        width: buffer.readUInt16LE(8),
        height: buffer.readUInt16LE(10),
      };
    }

    return null;
  }

  private async readMediaProbe(file: Express.Multer.File) {
    const ffprobePath = process.env.FFPROBE_PATH ?? "ffprobe";
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const tempDir = mkdtempSync(join(tmpdir(), "standix-assets-"));
    // Never derive the path from the client-supplied filename.
    const tempFile = join(tempDir, "input");
    writeFileSync(tempFile, file.buffer);

    try {
      const { stdout } = await execFileAsync(ffprobePath, [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        tempFile,
      ]);
      return JSON.parse(stdout);
    } catch {
      return null;
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
