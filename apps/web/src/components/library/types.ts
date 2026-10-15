export type AssetKind = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";

export type AssetTag = { id: string; name: string; color?: string | null };

export type Asset = {
  id: string;
  filename: string;
  displayName: string;
  kind: AssetKind;
  folderId: string | null;
  folder: { id: string; name: string; parentId: string | null } | null;
  isFavorite: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string | null;
  metadata: {
    sizeBytes?: number;
    width?: number | null;
    height?: number | null;
    resolution?: string | null;
    codec?: string | null;
    durationSeconds?: number | null;
    [key: string]: unknown;
  };
  tags: AssetTag[];
  blob: { id: string; sha256: string; mimeType: string; sizeBytes: number };
};

export type AssetReference = {
  type: "slide" | "scene" | "audioCue" | "videoCue";
  id: string;
  label: string;
  context: string | null;
  updatedAt: string;
};

export type AssetDetail = Asset & { references: AssetReference[] };

export type AssetFolder = {
  id: string;
  name: string;
  parentId: string | null;
  assetCount: number;
};

export type TagSummary = AssetTag & { assetCount: number };

export type LibraryFilters = {
  folderId: string;
  kind: AssetKind | "";
  favorite: boolean;
  trashed: boolean;
  search: string;
  tag: string;
};

export const kindLabels: Record<AssetKind, string> = {
  IMAGE: "Imagem",
  VIDEO: "Vídeo",
  AUDIO: "Áudio",
  DOCUMENT: "Documento",
  OTHER: "Outro",
};

export const kindIcons: Record<AssetKind, string> = {
  IMAGE: "▧",
  VIDEO: "▶",
  AUDIO: "♫",
  DOCUMENT: "▤",
  OTHER: "▧",
};

export const referenceLabels: Record<AssetReference["type"], string> = {
  slide: "Apresentação",
  scene: "Cena",
  audioCue: "Cue de áudio",
  videoCue: "Cue de vídeo",
};

export function formatBytes(value: unknown) {
  const bytes = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex ? 1 : 0)} ${units[unitIndex]}`;
}

export function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDuration(seconds: unknown) {
  const total = typeof seconds === "number" ? Math.round(seconds) : NaN;
  if (!Number.isFinite(total) || total <= 0) return null;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** "Pai / Filho / Neto" for a folder, from the flat folder list. */
export function folderPath(folders: AssetFolder[], folderId: string | null) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: AssetFolder[] = [];
  for (
    let folder = folderId ? byId.get(folderId) : undefined;
    folder && !path.includes(folder);
    folder = folder.parentId ? byId.get(folder.parentId) : undefined
  ) {
    path.unshift(folder);
  }
  return path;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
