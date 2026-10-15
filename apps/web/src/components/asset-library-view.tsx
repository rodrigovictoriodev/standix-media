"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { apiRequest } from "@/lib/api";
import { useApiSession } from "@/lib/use-api-session";

type AssetKind = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
type ViewMode = "Lista" | "Grid";

type Asset = {
  id: string;
  filename: string;
  displayName: string;
  kind: AssetKind;
  folderId?: string | null;
  folder?: { id: string; name: string; parentId?: string | null } | null;
  isFavorite: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  metadata: Record<string, unknown>;
  tags: { id: string; name: string }[];
};

type AssetFolder = {
  id: string;
  name: string;
  parentId: string | null;
};

type PresentationUsage = {
  id: string;
  title: string;
  updatedAt: string;
};

const kindLabels: Record<AssetKind, string> = {
  IMAGE: "Imagem",
  VIDEO: "Vídeo",
  AUDIO: "Áudio",
  DOCUMENT: "Documento",
  OTHER: "Outro",
};

function formatBytes(value: unknown) {
  const bytes = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex ? 1 : 0)} ${units[unitIndex]}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function AssetPreview({ asset }: { asset: Asset }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl("");
    setFailed(false);
    setImageLoaded(false);
    if (asset.kind !== "IMAGE") return;
    void apiRequest<{ url: string }>(
      `/assets/${encodeURIComponent(asset.id)}/url`,
    )
      .then(({ url: imageUrl }) => {
        if (!cancelled) setUrl(imageUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.kind]);

  if (asset.kind === "IMAGE" && !failed) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-black/20">
        {!imageLoaded && (
          <div
            aria-hidden="true"
            className="absolute inset-0 animate-pulse bg-gradient-to-br from-surface via-white/5 to-surface"
          />
        )}
        {url && (
          <img
            src={url}
            alt={asset.displayName}
            className={`absolute inset-0 h-full w-full object-contain p-2 transition-opacity duration-300 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    );
  }

  const icon =
    asset.kind === "VIDEO"
      ? "▶"
      : asset.kind === "AUDIO"
        ? "♫"
        : asset.kind === "DOCUMENT"
          ? "▤"
          : "▧";
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 via-surface to-secondary/10">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-background/70 text-2xl text-secondary shadow-lg">
        {icon}
      </span>
    </div>
  );
}

function FolderTree({
  folders,
  parentId,
  activeFolder,
  assetCounts,
  onSelect,
  depth = 0,
}: {
  folders: AssetFolder[];
  parentId: string | null;
  activeFolder: string;
  assetCounts: Map<string, number>;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  return (
    <>
      {folders
        .filter((folder) => folder.parentId === parentId)
        .map((folder) => (
          <div key={folder.id}>
            <button
              onClick={() => onSelect(folder.id)}
              aria-current={activeFolder === folder.id ? "page" : undefined}
              className={`flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-sm transition ${
                activeFolder === folder.id
                  ? "bg-primary/15 text-white"
                  : "text-muted hover:bg-white/5 hover:text-white"
              }`}
              style={{ paddingLeft: `${12 + depth * 14}px` }}
            >
              <span aria-hidden="true" className="text-amber-200/80">
                ▰
              </span>
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              <span className="text-xs text-muted/70">
                {assetCounts.get(folder.id) ?? 0}
              </span>
            </button>
            <FolderTree
              folders={folders}
              parentId={folder.id}
              activeFolder={activeFolder}
              assetCounts={assetCounts}
              onSelect={onSelect}
              depth={depth + 1}
            />
          </div>
        ))}
    </>
  );
}

export function AssetLibraryView() {
  const { accessToken, teamId } = useApiSession();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState("");
  const [kindFilter, setKindFilter] = useState<AssetKind | "">("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [trashOnly, setTrashOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("Grid");
  const [search, setSearch] = useState("");
  const [folderName, setFolderName] = useState("");
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [presentations, setPresentations] = useState<PresentationUsage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editName, setEditName] = useState("");
  const [editFolderId, setEditFolderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uploadInput = useRef<HTMLInputElement>(null);

  const loadAssets = useCallback(async () => {
    if (!accessToken || !teamId) {
      setAssets([]);
      setFolders([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [items, folderList] = await Promise.all([
        apiRequest<Asset[]>(`/assets${trashOnly ? "?trashed=true" : ""}`),
        apiRequest<AssetFolder[]>("/assets/folders"),
      ]);
      setAssets(items);
      setFolders(folderList);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar a biblioteca.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, teamId, trashOnly]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    if (!selectedAsset) {
      setPresentations([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void apiRequest<PresentationUsage[]>(
      `/assets/${encodeURIComponent(selectedAsset.id)}/usage`,
    )
      .then((items) => {
        if (!cancelled) setPresentations(items);
      })
      .catch((usageError) => {
        if (!cancelled) {
          setPresentations([]);
          setError(
            usageError instanceof Error
              ? usageError.message
              : "Não foi possível carregar o uso deste ativo.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAsset?.id]);

  const kindOptions = useMemo(
    () => [
      { label: "Todos os tipos", value: "" as const },
      ...Object.entries(kindLabels).map(([value, label]) => ({
        label,
        value: value as AssetKind,
      })),
    ],
    [],
  );

  const folderPath = useMemo(() => {
    const path: AssetFolder[] = [];
    let folder = folders.find((item) => item.id === activeFolder);
    while (folder) {
      path.unshift(folder);
      folder = folder.parentId
        ? folders.find((item) => item.id === folder?.parentId)
        : undefined;
    }
    return path;
  }, [activeFolder, folders]);

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) {
      const id = asset.folderId ?? asset.folder?.id;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [assets]);

  const visibleAssets = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return assets.filter((asset) => {
      const assetFolderId = asset.folderId ?? asset.folder?.id ?? "";
      const searchableText = [
        asset.displayName,
        asset.filename,
        asset.folder?.name ?? "",
        ...asset.tags.map((tag) => tag.name),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return (
        (!activeFolder || assetFolderId === activeFolder) &&
        (!kindFilter || asset.kind === kindFilter) &&
        (!favoritesOnly || asset.isFavorite) &&
        (!normalizedSearch || searchableText.includes(normalizedSearch))
      );
    });
  }, [activeFolder, assets, favoritesOnly, kindFilter, search]);

  async function uploadFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      if (activeFolder) body.append("folderId", activeFolder);
      await apiRequest<Asset>("/assets/upload", { method: "POST", body });
      await loadAssets();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Não foi possível enviar o arquivo.",
      );
    } finally {
      setBusy(false);
      if (uploadInput.current) uploadInput.current.value = "";
    }
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest<AssetFolder>("/assets/folders", {
        method: "POST",
        body: JSON.stringify({
          name: folderName.trim(),
          parentId: activeFolder || undefined,
        }),
      });
      setFolderName("");
      setShowFolderForm(false);
      await loadAssets();
    } catch (folderError) {
      setError(
        folderError instanceof Error
          ? folderError.message
          : "Não foi possível criar a pasta.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(asset: Asset) {
    setError("");
    try {
      const updated = await apiRequest<Asset>(
        `/assets/${encodeURIComponent(asset.id)}/favorite`,
        { method: "PATCH" },
      );
      setAssets((items) =>
        favoritesOnly && !updated.isFavorite
          ? items.filter((item) => item.id !== updated.id)
          : items.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (favoriteError) {
      setError(
        favoriteError instanceof Error
          ? favoriteError.message
          : "Não foi possível atualizar o favorito.",
      );
    }
  }

  function openDetails(asset: Asset) {
    setSelectedAsset(asset);
    setEditName(asset.displayName || asset.filename);
    setEditFolderId(asset.folderId ?? asset.folder?.id ?? "");
    setError("");
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, asset: Asset) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetails(asset);
    }
  }

  async function saveAssetDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAsset) return;
    setBusy(true);
    setError("");
    try {
      const updated = await apiRequest<Asset>(
        `/assets/${encodeURIComponent(selectedAsset.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            displayName: editName,
            folderId: editFolderId || null,
          }),
        },
      );
      setAssets((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedAsset(updated);
      setEditName(updated.displayName);
      setEditFolderId(updated.folderId ?? "");
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Não foi possível atualizar o ativo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function moveToTrash(asset: Asset) {
    setBusy(true);
    setError("");
    try {
      await apiRequest<Asset>(`/assets/${encodeURIComponent(asset.id)}/trash`, {
        method: "PATCH",
      });
      setSelectedAsset(null);
      await loadAssets();
    } catch (trashError) {
      setError(
        trashError instanceof Error
          ? trashError.message
          : "Não foi possível mover o ativo para a lixeira.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restoreAsset(asset: Asset) {
    setBusy(true);
    setError("");
    try {
      await apiRequest<Asset>(
        `/assets/${encodeURIComponent(asset.id)}/restore`,
        { method: "PATCH" },
      );
      setSelectedAsset(null);
      await loadAssets();
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Não foi possível restaurar o ativo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function permanentlyDeleteAsset(asset: Asset) {
    if (
      !window.confirm(
        `Excluir permanentemente “${asset.displayName || asset.filename}”? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/assets/${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
      });
      setSelectedAsset(null);
      await loadAssets();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Não foi possível excluir o ativo permanentemente.",
      );
    } finally {
      setBusy(false);
    }
  }

  function renderCard(asset: Asset): ReactNode {
    const folderNameForAsset =
      asset.folder?.name ??
      folders.find((folder) => folder.id === asset.folderId)?.name ??
      "Sem pasta";
    return (
      <article
        key={asset.id}
        role="button"
        tabIndex={0}
        onClick={() => openDetails(asset)}
        onKeyDown={(event) => handleCardKeyDown(event, asset)}
        className="group min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-border bg-background transition hover:border-primary/60 hover:shadow-[0_12px_40px_rgba(0,0,0,0.25)] focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-border bg-surface">
          <AssetPreview asset={asset} />
          <span className="absolute left-3 top-3 rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white/90 backdrop-blur">
            {kindLabels[asset.kind]}
          </span>
          {!trashOnly && (
            <button
              aria-label={
                asset.isFavorite
                  ? "Remover dos favoritos"
                  : "Adicionar aos favoritos"
              }
              title={asset.isFavorite ? "Favorito" : "Adicionar aos favoritos"}
              onClick={(event) => {
                event.stopPropagation();
                void toggleFavorite(asset);
              }}
              onKeyDown={(event) => event.stopPropagation()}
              className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 text-lg backdrop-blur transition hover:bg-black/80 ${
                asset.isFavorite ? "text-amber-300" : "text-white/60"
              }`}
            >
              ★
            </button>
          )}
          <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white/90 backdrop-blur">
            {formatBytes(asset.metadata.sizeBytes)}
          </span>
        </div>
        <div className="p-4">
          <p
            className="truncate font-medium text-white"
            title={asset.displayName || asset.filename}
          >
            {asset.displayName || asset.filename}
          </p>
          <p
            className="mt-1 truncate text-xs text-muted"
            title={asset.filename}
          >
            {asset.filename}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs text-muted">
            <span className="truncate">{folderNameForAsset}</span>
            <span className="shrink-0">
              {new Date(asset.createdAt).toLocaleDateString("pt-BR")}
            </span>
          </div>
          {trashOnly && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  void restoreAsset(asset);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                disabled={busy}
                className="flex-1 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                Restaurar
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  void permanentlyDeleteAsset(asset);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                disabled={busy}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
              >
                Excluir
              </button>
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="relative rounded-[28px] border border-border bg-surface/90 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="border-b border-border px-5 py-6 md:px-7">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-secondary">
              Biblioteca central
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Mídia e ativos
            </h2>
            <p className="mt-1 text-sm text-muted">
              Organize, encontre e acompanhe seus arquivos de mídia.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={uploadInput}
              type="file"
              className="hidden"
              onChange={(event) => void uploadFile(event.target.files?.[0])}
            />
            <button
              onClick={() => uploadInput.current?.click()}
              disabled={busy || !accessToken || !teamId || trashOnly}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/15 transition hover:bg-primary/90 disabled:opacity-50"
            >
              + Enviar mídia
            </button>
            <button
              onClick={() => setShowFolderForm((visible) => !visible)}
              disabled={!accessToken || !teamId || trashOnly}
              className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-white transition hover:bg-white/5 disabled:opacity-50"
            >
              Nova pasta
            </button>
            <button
              onClick={() => void loadAssets()}
              disabled={loading}
              aria-label="Atualizar biblioteca"
              title="Atualizar"
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-muted transition hover:text-white disabled:opacity-50"
            >
              ↻
            </button>
          </div>
        </div>
        {showFolderForm && (
          <form
            onSubmit={(event) => void createFolder(event)}
            className="mt-5 flex max-w-xl gap-2 rounded-2xl border border-border bg-background p-3"
          >
            <input
              required
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder={
                activeFolder ? "Nome da subpasta" : "Nome da nova pasta"
              }
              aria-label="Nome da nova pasta"
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-white placeholder:text-muted"
            />
            <button
              disabled={busy}
              className="rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Criar pasta
            </button>
          </form>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mx-5 mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 md:mx-7"
        >
          {error}
        </p>
      )}

      {!accessToken || !teamId ? (
        <p className="m-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          Entre e informe o ID da equipe para carregar a biblioteca.
        </p>
      ) : (
        <div className="grid min-h-[560px] lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="border-b border-border p-4 lg:border-b-0 lg:border-r">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Espaço de trabalho
            </p>
            <button
              onClick={() => {
                setTrashOnly(false);
                setFavoritesOnly(false);
                setActiveFolder("");
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                !trashOnly && !favoritesOnly && !activeFolder
                  ? "bg-primary/15 text-white"
                  : "text-muted hover:bg-white/5 hover:text-white"
              }`}
            >
              <span>▦</span>
              <span className="flex-1">Todos os ativos</span>
              <span className="text-xs text-muted/70">
                {trashOnly ? "—" : assets.length}
              </span>
            </button>
            <button
              onClick={() => {
                setTrashOnly(false);
                setFavoritesOnly((current) => !current);
                setActiveFolder("");
              }}
              className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                favoritesOnly
                  ? "bg-primary/15 text-white"
                  : "text-muted hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="text-amber-300">★</span>
              <span className="flex-1">Favoritos</span>
            </button>
            <button
              onClick={() => {
                setTrashOnly((current) => !current);
                setFavoritesOnly(false);
                setActiveFolder("");
              }}
              className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                trashOnly
                  ? "bg-primary/15 text-white"
                  : "text-muted hover:bg-white/5 hover:text-white"
              }`}
            >
              <span>▱</span>
              <span className="flex-1">Lixeira</span>
              <span className="text-xs text-muted/70">
                {trashOnly ? assets.length : " "}
              </span>
            </button>

            <div className="mb-2 mt-7 flex items-center justify-between px-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                Pastas
              </p>
              <button
                onClick={() => setShowFolderForm(true)}
                disabled={trashOnly}
                aria-label="Criar pasta"
                title="Criar pasta"
                className="text-lg leading-none text-muted hover:text-white disabled:opacity-40"
              >
                +
              </button>
            </div>
            <button
              onClick={() => setActiveFolder("")}
              className={`flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-sm ${
                !activeFolder && !trashOnly
                  ? "bg-primary/15 text-white"
                  : "text-muted hover:bg-white/5 hover:text-white"
              }`}
              style={{ paddingLeft: 12 }}
            >
              <span className="text-amber-200/80">▰</span>
              <span className="min-w-0 flex-1 truncate">Todas as pastas</span>
              <span className="text-xs text-muted/70">{assets.length}</span>
            </button>
            <FolderTree
              folders={folders}
              parentId={null}
              activeFolder={activeFolder}
              assetCounts={folderCounts}
              onSelect={(id) => {
                setActiveFolder(id);
                setTrashOnly(false);
                setFavoritesOnly(false);
              }}
            />
            {folders.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted/70">
                Suas pastas aparecerão aqui.
              </p>
            )}
          </aside>

          <main className="min-w-0 p-4 md:p-6">
            <div className="mb-5 flex flex-col gap-4">
              <nav
                aria-label="Caminho da pasta"
                className="flex min-w-0 items-center gap-2 text-sm"
              >
                <button
                  onClick={() => setActiveFolder("")}
                  className="shrink-0 text-muted hover:text-white"
                >
                  Biblioteca
                </button>
                {trashOnly ? (
                  <>
                    <span className="text-muted/50">/</span>
                    <span className="truncate text-white">Lixeira</span>
                  </>
                ) : (
                  folderPath.map((folder, index) => (
                    <span
                      key={folder.id}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <span className="text-muted/50">/</span>
                      {index === folderPath.length - 1 ? (
                        <span className="truncate text-white">
                          {folder.name}
                        </span>
                      ) : (
                        <button
                          onClick={() => setActiveFolder(folder.id)}
                          className="truncate text-muted hover:text-white"
                        >
                          {folder.name}
                        </button>
                      )}
                    </span>
                  ))
                )}
              </nav>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {trashOnly
                      ? "Itens excluídos"
                      : activeFolder
                        ? (folderPath.at(-1)?.name ?? "Pasta")
                        : favoritesOnly
                          ? "Favoritos"
                          : "Todos os ativos"}
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    {visibleAssets.length}{" "}
                    {visibleAssets.length === 1 ? "arquivo" : "arquivos"}
                    {trashOnly
                      ? " na lixeira"
                      : activeFolder
                        ? " nesta pasta"
                        : " na biblioteca"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nome ou tag"
                    aria-label="Buscar ativos"
                    className="min-w-[180px] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-white placeholder:text-muted md:flex-none md:w-56"
                  />
                  <select
                    value={kindFilter}
                    onChange={(event) =>
                      setKindFilter(event.target.value as AssetKind | "")
                    }
                    aria-label="Filtrar por tipo"
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-white"
                  >
                    {kindOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex rounded-xl border border-border bg-background p-1">
                    {(["Grid", "Lista"] as const).map((option) => (
                      <button
                        key={option}
                        onClick={() => setViewMode(option)}
                        aria-pressed={viewMode === option}
                        className={`rounded-lg px-3 py-1.5 text-xs ${
                          viewMode === option
                            ? "bg-primary text-white"
                            : "text-muted"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {loading && (
              <p className="mb-4 text-xs text-muted">Carregando biblioteca…</p>
            )}
            {visibleAssets.length === 0 && !loading ? (
              <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
                <span className="text-3xl text-muted/70">
                  {trashOnly ? "▱" : "▧"}
                </span>
                <p className="mt-3 text-sm font-medium text-white">
                  {trashOnly
                    ? "A lixeira está vazia"
                    : search
                      ? "Nenhum arquivo corresponde à busca"
                      : "Nenhum arquivo nesta visualização"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {trashOnly
                    ? "Arquivos removidos aparecerão aqui."
                    : "Envie mídias ou organize seus arquivos em pastas."}
                </p>
              </div>
            ) : viewMode === "Grid" ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleAssets.map(renderCard)}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-background">
                <div className="hidden grid-cols-[minmax(0,1.8fr)_0.6fr_0.6fr_0.8fr] border-b border-border bg-surface px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-muted md:grid">
                  <span>Ativo</span>
                  <span>Tipo</span>
                  <span>Tamanho</span>
                  <span>Adicionado</span>
                </div>
                {visibleAssets.map((asset) => (
                  <div
                    key={asset.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetails(asset)}
                    onKeyDown={(event) => handleCardKeyDown(event, asset)}
                    className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 text-sm text-white last:border-b-0 hover:bg-white/[0.03] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary md:grid-cols-[minmax(0,1.8fr)_0.6fr_0.6fr_0.8fr]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
                        <AssetPreview asset={asset} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {asset.displayName || asset.filename}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {asset.filename}
                        </p>
                      </div>
                    </div>
                    <span className="hidden text-muted md:block">
                      {kindLabels[asset.kind]}
                    </span>
                    <span className="hidden text-muted md:block">
                      {formatBytes(asset.metadata.sizeBytes)}
                    </span>
                    <span className="hidden text-muted md:block">
                      {new Date(asset.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                    {trashOnly ? (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void restoreAsset(asset);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                        disabled={busy}
                        className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs text-primary disabled:opacity-50"
                      >
                        Restaurar
                      </button>
                    ) : (
                      <span className="text-muted md:hidden">›</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      )}

      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            aria-label="Fechar detalhes do ativo"
            onClick={() => setSelectedAsset(null)}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-details-title"
            className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-secondary">
                  Detalhes do ativo
                </p>
                <h2
                  id="asset-details-title"
                  className="mt-1 text-lg font-semibold text-white"
                >
                  {selectedAsset.displayName || selectedAsset.filename}
                </h2>
              </div>
              <button
                onClick={() => setSelectedAsset(null)}
                aria-label="Fechar"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:bg-white/5 hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <div className="aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-background">
                <AssetPreview asset={selectedAsset} />
              </div>
              {selectedAsset.deletedAt ? (
                <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
                  Este ativo está na lixeira. Restaure-o para renomear ou mover.
                </div>
              ) : (
                <form
                  onSubmit={(event) => void saveAssetDetails(event)}
                  className="mt-6 space-y-4"
                >
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">
                      Nome amigável
                    </span>
                    <input
                      required
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-white focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">
                      Pasta
                    </span>
                    <select
                      value={editFolderId}
                      onChange={(event) => setEditFolderId(event.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-white"
                    >
                      <option value="">Todas as pastas (raiz)</option>
                      {folders.map((folder) => {
                        const path: string[] = [folder.name];
                        let parentId = folder.parentId;
                        while (parentId) {
                          const parent = folders.find(
                            (item) => item.id === parentId,
                          );
                          if (!parent) break;
                          path.unshift(parent.name);
                          parentId = parent.parentId;
                        }
                        return (
                          <option key={folder.id} value={folder.id}>
                            {path.join(" / ")}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={
                      busy ||
                      !editName.trim() ||
                      (editName.trim() === selectedAsset.displayName &&
                        editFolderId ===
                          (selectedAsset.folderId ??
                            selectedAsset.folder?.id ??
                            ""))
                    }
                    className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    Salvar alterações
                  </button>
                </form>
              )}

              <section className="mt-7 border-t border-border pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Informações do arquivo
                </h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Nome físico</dt>
                    <dd className="max-w-[65%] break-all text-right text-white">
                      {selectedAsset.filename}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Tipo</dt>
                    <dd className="text-white">
                      {kindLabels[selectedAsset.kind]}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Tamanho</dt>
                    <dd className="text-white">
                      {formatBytes(selectedAsset.metadata.sizeBytes)}
                    </dd>
                  </div>
                  {typeof selectedAsset.metadata.resolution === "string" && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">Resolução</dt>
                      <dd className="text-white">
                        {selectedAsset.metadata.resolution}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Adicionado</dt>
                    <dd className="text-right text-white">
                      {formatDate(selectedAsset.createdAt)}
                    </dd>
                  </div>
                  {selectedAsset.tags.length > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">Tags</dt>
                      <dd className="text-right text-white">
                        {selectedAsset.tags.map((tag) => tag.name).join(", ")}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>

              <section className="mt-7 border-t border-border pt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    Apresentações que utilizam este ativo
                  </h3>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-muted">
                    {presentations.length}
                  </span>
                </div>
                {detailLoading ? (
                  <p className="mt-4 text-sm text-muted">Carregando uso…</p>
                ) : presentations.length ? (
                  <ul className="mt-3 space-y-2">
                    {presentations.map((presentation) => (
                      <li
                        key={presentation.id}
                        className="rounded-xl border border-border bg-background px-4 py-3"
                      >
                        <p className="text-sm font-medium text-white">
                          {presentation.title}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Atualizada em {formatDate(presentation.updatedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
                    Nenhuma apresentação utiliza este ativo.
                  </p>
                )}
              </section>

              <div className="mt-7 border-t border-border pt-6">
                {selectedAsset.deletedAt ? (
                  <div className="flex gap-3">
                    <button
                      onClick={() => void restoreAsset(selectedAsset)}
                      disabled={busy}
                      className="flex-1 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primary disabled:opacity-50"
                    >
                      Restaurar ativo
                    </button>
                    <button
                      onClick={() => void permanentlyDeleteAsset(selectedAsset)}
                      disabled={busy}
                      className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200 disabled:opacity-50"
                    >
                      Excluir definitivamente
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => void moveToTrash(selectedAsset)}
                    disabled={busy}
                    className="w-full rounded-xl border border-rose-500/25 px-4 py-2.5 text-sm text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    Mover para a lixeira
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
