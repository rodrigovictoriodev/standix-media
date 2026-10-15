import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { AssetKind, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import {
  MediaProcessingService,
  THUMBNAIL_MIME,
} from "../media/media-processing.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

const assetInclude = {
  blob: true,
  folder: true,
  tags: { orderBy: { name: "asc" } },
} satisfies Prisma.AssetInclude;

type AssetWithDetails = Prisma.AssetGetPayload<{ include: typeof assetInclude }>;

export type AssetFilters = {
  folderId?: string;
  includeSubfolders?: boolean;
  search?: string;
  tag?: string;
  favorite?: boolean;
  trashed?: boolean;
  kind?: AssetKind;
};

export type AssetReference = {
  type: "slide" | "scene" | "audioCue" | "videoCue";
  id: string;
  label: string;
  context: string | null;
  updatedAt: Date;
};

// Uploads hold the transaction while the object is written to MinIO.
const BLOB_TRANSACTION = { maxWait: 30_000, timeout: 120_000 };

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly media: MediaProcessingService,
  ) {}

  async create(
    teamId: string,
    ownerId: string,
    file: Express.Multer.File,
    options: { folderId?: string | null; tags?: string[] } = {},
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("The uploaded file is empty");
    }
    const folderId = options.folderId || null;
    if (folderId) await this.getTeamFolder(teamId, folderId);

    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const processed = await this.media.process(file.buffer, file.mimetype);
    const tagNames = normalizeTags(options.tags ?? []);

    const asset = await this.prisma.$transaction(async (tx) => {
      // Serialises uploads and permanent deletions of the same content so a
      // blob is never removed while another asset starts referencing it.
      await this.lockBlob(tx, sha256);

      let blob = await tx.mediaBlob.findUnique({ where: { sha256 } });
      if (!blob) {
        const storageKey = blobKey(sha256);
        await this.storage.putObject(storageKey, file.buffer, file.mimetype);
        blob = await tx.mediaBlob.create({
          data: {
            sha256,
            mimeType: file.mimetype,
            sizeBytes: BigInt(file.size),
            storageBucket: this.storage.bucket,
            storageKey,
          },
        });
      }
      if (!blob.thumbnailKey && processed.thumbnail) {
        const thumbnailKey = thumbnailKeyFor(sha256);
        await this.storage.putObject(
          thumbnailKey,
          processed.thumbnail,
          THUMBNAIL_MIME,
        );
        blob = await tx.mediaBlob.update({
          where: { id: blob.id },
          data: { thumbnailKey },
        });
      }

      return tx.asset.create({
        data: {
          teamId,
          ownerId,
          filename: file.originalname,
          displayName: file.originalname,
          kind: assetKind(file.mimetype),
          folderId,
          blobId: blob.id,
          metadata: {
            sha256,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            originalName: file.originalname,
            ...processed.metadata,
          },
          tags: {
            connectOrCreate: tagNames.map((name) => ({
              where: { teamId_name: { teamId, name } },
              create: { teamId, name },
            })),
          },
        },
        include: assetInclude,
      });
    }, BLOB_TRANSACTION);

    return this.present(asset);
  }

  async listAssets(teamId: string, filters: AssetFilters = {}) {
    const search = filters.search?.trim();
    const where: Prisma.AssetWhereInput = {
      teamId,
      deletedAt: filters.trashed ? { not: null } : null,
      ...(filters.favorite ? { isFavorite: true } : {}),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.tag ? { tags: { some: { name: filters.tag } } } : {}),
      ...(await this.folderFilter(teamId, filters)),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: "insensitive" } },
              { filename: { contains: search, mode: "insensitive" } },
              {
                tags: {
                  some: { name: { contains: search, mode: "insensitive" } },
                },
              },
              {
                folder: { name: { contains: search, mode: "insensitive" } },
              },
            ],
          }
        : {}),
    };

    const assets = await this.prisma.asset.findMany({
      where,
      include: assetInclude,
      orderBy: filters.trashed ? { deletedAt: "desc" } : { createdAt: "desc" },
    });
    return Promise.all(assets.map((asset) => this.present(asset)));
  }

  async getAsset(teamId: string, assetId: string) {
    const asset = await this.getTeamAsset(teamId, assetId);
    const [presented, references] = await Promise.all([
      this.present(asset),
      this.getAssetReferences(teamId, assetId),
    ]);
    return { ...presented, references };
  }

  async getDownloadUrl(teamId: string, assetId: string, download = false) {
    const asset = await this.getTeamAsset(teamId, assetId);
    const url = await this.storage.signedUrl(
      asset.blob.storageBucket,
      asset.blob.storageKey,
      {
        contentType: asset.blob.mimeType,
        downloadName: download ? downloadName(asset) : undefined,
      },
    );
    return { url, expiresInSeconds: this.storage.signedUrlTtlSeconds };
  }

  /** Everything in the team that points at this asset. */
  async getAssetReferences(
    teamId: string,
    assetId: string,
  ): Promise<AssetReference[]> {
    const [slides, scenes, audioCues, videoCues] = await Promise.all([
      this.prisma.slide.findMany({
        where: { assetId, presentation: { teamId } },
        select: {
          orderIndex: true,
          presentation: { select: { id: true, title: true, updatedAt: true } },
        },
        orderBy: { orderIndex: "asc" },
      }),
      this.prisma.scene.findMany({
        where: { assetId, event: { teamId } },
        select: {
          id: true,
          name: true,
          updatedAt: true,
          event: { select: { name: true } },
        },
      }),
      this.prisma.audioCue.findMany({
        where: { assetId, teamId },
        select: {
          id: true,
          name: true,
          updatedAt: true,
          bank: { select: { name: true } },
        },
      }),
      this.prisma.videoCue.findMany({
        where: { assetId, teamId },
        select: {
          id: true,
          name: true,
          updatedAt: true,
          event: { select: { name: true } },
        },
      }),
    ]);

    const byPresentation = new Map<string, AssetReference>();
    for (const { presentation, orderIndex } of slides) {
      const existing = byPresentation.get(presentation.id);
      const slide = `Slide ${orderIndex + 1}`;
      byPresentation.set(presentation.id, {
        type: "slide",
        id: presentation.id,
        label: presentation.title,
        context: existing ? `${existing.context}, ${slide}` : slide,
        updatedAt: presentation.updatedAt,
      });
    }

    return [
      ...byPresentation.values(),
      ...scenes.map((scene) => ({
        type: "scene" as const,
        id: scene.id,
        label: scene.name,
        context: scene.event.name,
        updatedAt: scene.updatedAt,
      })),
      ...audioCues.map((cue) => ({
        type: "audioCue" as const,
        id: cue.id,
        label: cue.name,
        context: cue.bank?.name ?? null,
        updatedAt: cue.updatedAt,
      })),
      ...videoCues.map((cue) => ({
        type: "videoCue" as const,
        id: cue.id,
        label: cue.name,
        context: cue.event?.name ?? null,
        updatedAt: cue.updatedAt,
      })),
    ];
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
    if (input.folderId) await this.getTeamFolder(teamId, input.folderId);

    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(input.folderId !== undefined
          ? { folderId: input.folderId || null }
          : {}),
      },
      include: assetInclude,
    });
    return this.present(updated);
  }

  async setTags(teamId: string, assetId: string, tags: string[]) {
    const asset = await this.getTeamAsset(teamId, assetId);
    if (asset.deletedAt) {
      throw new BadRequestException("Restore the asset before editing it");
    }
    const names = normalizeTags(tags);
    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        tags: {
          set: [],
          connectOrCreate: names.map((name) => ({
            where: { teamId_name: { teamId, name } },
            create: { teamId, name },
          })),
        },
      },
      include: assetInclude,
    });
    return this.present(updated);
  }

  async toggleFavorite(teamId: string, assetId: string) {
    const asset = await this.getTeamAsset(teamId, assetId);
    if (asset.deletedAt) {
      throw new BadRequestException("Restore the asset before editing it");
    }
    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: { isFavorite: !asset.isFavorite },
      include: assetInclude,
    });
    return this.present(updated);
  }

  async trashAsset(teamId: string, assetId: string) {
    const asset = await this.getTeamAsset(teamId, assetId);
    if (asset.deletedAt) return this.present(asset);
    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: { deletedAt: new Date() },
      include: assetInclude,
    });
    return this.present(updated);
  }

  async restoreAsset(teamId: string, assetId: string) {
    const asset = await this.getTeamAsset(teamId, assetId);
    if (!asset.deletedAt) return this.present(asset);
    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: { deletedAt: null },
      include: assetInclude,
    });
    return this.present(updated);
  }

  async deleteAsset(teamId: string, assetId: string) {
    const asset = await this.getTeamAsset(teamId, assetId);
    if (!asset.deletedAt) {
      throw new BadRequestException(
        "Move the asset to the trash before deleting it",
      );
    }
    const references = await this.getAssetReferences(teamId, assetId);
    if (references.length) {
      throw new ConflictException({
        message: "The asset is still referenced and cannot be deleted",
        references,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockBlob(tx, asset.blob.sha256);
      await tx.asset.delete({ where: { id: assetId } });
      const remaining = await tx.asset.count({
        where: { blobId: asset.blobId },
      });
      if (remaining > 0) return;

      await tx.mediaBlob.delete({ where: { id: asset.blobId } });
      // Removed while the lock is held: a concurrent upload of the same bytes
      // waits and then writes a fresh object.
      await this.storage.removeObject(
        asset.blob.storageBucket,
        asset.blob.storageKey,
      );
      if (asset.blob.thumbnailKey) {
        await this.storage.removeObject(
          asset.blob.storageBucket,
          asset.blob.thumbnailKey,
        );
      }
    }, BLOB_TRANSACTION);

    return { id: assetId, deleted: true };
  }

  async listFolders(teamId: string) {
    const [folders, counts] = await Promise.all([
      this.prisma.assetFolder.findMany({
        where: { teamId },
        orderBy: { name: "asc" },
      }),
      this.prisma.asset.groupBy({
        by: ["folderId"],
        where: { teamId, deletedAt: null, folderId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const countByFolder = new Map(
      counts.map((row) => [row.folderId, row._count._all]),
    );
    return folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      assetCount: countByFolder.get(folder.id) ?? 0,
    }));
  }

  async createFolder(teamId: string, name: string, parentId?: string | null) {
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException("Folder name is required");
    if (parentId) await this.getTeamFolder(teamId, parentId);

    return this.withFolderNameGuard(() =>
      this.prisma.assetFolder.create({
        data: { teamId, name: normalized, parentId: parentId || null },
      }),
    );
  }

  async updateFolder(
    teamId: string,
    folderId: string,
    input: { name?: string; parentId?: string | null },
  ) {
    await this.getTeamFolder(teamId, folderId);
    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new BadRequestException("Folder name is required");
    }

    if (input.parentId) {
      const folders = await this.prisma.assetFolder.findMany({
        where: { teamId },
        select: { id: true, parentId: true },
      });
      const parents = new Map(folders.map((f) => [f.id, f.parentId]));
      if (!parents.has(input.parentId)) {
        throw new NotFoundException("Folder not found for this team");
      }
      // Walk up from the new parent: reaching the folder itself is a cycle.
      for (
        let cursor: string | null | undefined = input.parentId;
        cursor;
        cursor = parents.get(cursor)
      ) {
        if (cursor === folderId) {
          throw new BadRequestException(
            "A folder cannot be moved into itself or one of its subfolders",
          );
        }
      }
    }

    return this.withFolderNameGuard(() =>
      this.prisma.assetFolder.update({
        where: { id: folderId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(input.parentId !== undefined
            ? { parentId: input.parentId || null }
            : {}),
        },
      }),
    );
  }

  /** Only empty folders can be removed; trashed items move to the root. */
  async deleteFolder(teamId: string, folderId: string) {
    await this.getTeamFolder(teamId, folderId);
    const [children, activeAssets] = await Promise.all([
      this.prisma.assetFolder.count({ where: { parentId: folderId } }),
      this.prisma.asset.count({ where: { folderId, deletedAt: null } }),
    ]);
    if (children || activeAssets) {
      throw new ConflictException(
        "Only empty folders can be deleted. Move or delete its contents first.",
      );
    }
    await this.prisma.$transaction([
      this.prisma.asset.updateMany({
        where: { folderId },
        data: { folderId: null },
      }),
      this.prisma.assetFolder.delete({ where: { id: folderId } }),
    ]);
    return { id: folderId, deleted: true };
  }

  async listTags(teamId: string) {
    const tags = await this.prisma.assetTag.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        _count: { select: { assets: { where: { deletedAt: null } } } },
      },
    });
    return tags.map(({ _count, ...tag }) => ({
      ...tag,
      assetCount: _count.assets,
    }));
  }

  /**
   * Regenerates technical metadata and thumbnails for every stored object.
   * Used once to backfill uploads made before thumbnails existed.
   */
  async reprocessAllBlobs() {
    const blobs = await this.prisma.mediaBlob.findMany({
      include: { assets: { select: { id: true, metadata: true } } },
    });
    let thumbnails = 0;
    for (const blob of blobs) {
      const buffer = await this.storage.getObject(
        blob.storageBucket,
        blob.storageKey,
      );
      const processed = await this.media.process(buffer, blob.mimeType);
      if (processed.thumbnail) {
        const thumbnailKey = thumbnailKeyFor(blob.sha256);
        await this.storage.putObject(
          thumbnailKey,
          processed.thumbnail,
          THUMBNAIL_MIME,
        );
        await this.prisma.mediaBlob.update({
          where: { id: blob.id },
          data: { thumbnailKey },
        });
        thumbnails += 1;
      }
      for (const asset of blob.assets) {
        await this.prisma.asset.update({
          where: { id: asset.id },
          data: {
            metadata: { ...jsonObject(asset.metadata), ...processed.metadata },
          },
        });
      }
    }
    return { blobs: blobs.length, thumbnails };
  }

  private async present(asset: AssetWithDetails) {
    const metadata = jsonObject(asset.metadata);
    const thumbnailUrl = asset.blob.thumbnailKey
      ? await this.storage.signedUrl(
          asset.blob.storageBucket,
          asset.blob.thumbnailKey,
          { contentType: THUMBNAIL_MIME },
        )
      : null;
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
      thumbnailUrl,
      metadata: {
        ...metadata,
        sizeBytes: Number(asset.blob.sizeBytes),
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
      blob: {
        id: asset.blob.id,
        sha256: asset.blob.sha256,
        mimeType: asset.blob.mimeType,
        sizeBytes: Number(asset.blob.sizeBytes),
      },
    };
  }

  private async folderFilter(
    teamId: string,
    filters: AssetFilters,
  ): Promise<Prisma.AssetWhereInput> {
    if (!filters.folderId) return {};
    if (filters.folderId === "root") return { folderId: null };
    if (!filters.includeSubfolders) return { folderId: filters.folderId };

    const folders = await this.prisma.assetFolder.findMany({
      where: { teamId },
      select: { id: true, parentId: true },
    });
    const ids = new Set([filters.folderId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const folder of folders) {
        if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
          ids.add(folder.id);
          grew = true;
        }
      }
    }
    return { folderId: { in: [...ids] } };
  }

  private async withFolderNameGuard<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "A folder with this name already exists here",
        );
      }
      throw error;
    }
  }

  private async lockBlob(tx: Prisma.TransactionClient, sha256: string) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${sha256}))`;
  }

  private async getTeamFolder(teamId: string, folderId: string) {
    const folder = await this.prisma.assetFolder.findFirst({
      where: { id: folderId, teamId },
    });
    if (!folder) throw new NotFoundException("Folder not found for this team");
    return folder;
  }

  private async getTeamAsset(teamId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, teamId },
      include: assetInclude,
    });
    if (!asset) throw new NotFoundException("Asset not found");
    return asset;
  }
}

function blobKey(sha256: string) {
  return `sha256/${sha256.slice(0, 2)}/${sha256}`;
}

function thumbnailKeyFor(sha256: string) {
  return `thumbnails/${sha256.slice(0, 2)}/${sha256}.webp`;
}

function assetKind(mimeType: string): AssetKind {
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

function normalizeTags(tags: string[]) {
  return [
    ...new Set(
      tags
        .map((tag) => tag.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR"))
        .filter(Boolean),
    ),
  ];
}

/** Friendly name for downloads, keeping the physical file's extension. */
function downloadName(asset: { displayName: string; filename: string }) {
  const name = asset.displayName || asset.filename;
  const extension = extname(asset.filename);
  return extension && !name.toLowerCase().endsWith(extension.toLowerCase())
    ? `${name}${extension}`
    : name;
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}
