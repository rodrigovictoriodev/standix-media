"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useApiSession } from "@/lib/use-api-session";
import { AssetDetailsDrawer } from "./library/asset-details-drawer";
import { AssetThumbnail } from "./library/asset-thumbnail";
import { FolderTree, folderOptions } from "./library/folder-tree";
import {
  errorMessage,
  folderPath,
  formatBytes,
  kindLabels,
  type Asset,
  type AssetKind,
  type LibraryFilters,
} from "./library/types";
import {
  useAssets,
  useFolders,
  useLibraryMutations,
  useTags,
} from "./library/use-library";

type ViewMode = "Grid" | "Lista";
type FolderForm = { mode: "create" | "rename" | "move"; name: string; parentId: string };

const emptyFilters: LibraryFilters = {
  folderId: "",
  kind: "",
  favorite: false,
  trashed: false,
  search: "",
  tag: "",
};

export function AssetLibraryView() {
  const { accessToken, teamId, ready } = useApiSession();
  const [filters, setFilters] = useState<LibraryFilters>(emptyFilters);
  const [searchInput, setSearchInput] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("Grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folderForm, setFolderForm] = useState<FolderForm | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const uploadInput = useRef<HTMLInputElement>(null);

  const assetsQuery = useAssets(filters);
  const foldersQuery = useFolders();
  const tagsQuery = useTags();
  const mutations = useLibraryMutations();
  const assets = assetsQuery.data ?? [];
  const folders = foldersQuery.data ?? [];
  const tags = tagsQuery.data ?? [];
  const activeFolder = filters.folderId;
  const path = folderPath(folders, activeFolder || null);
  const selected = assets.find((asset) => asset.id === selectedId) ?? null;

  // Debounced server-side search (name, physical name, tag and folder).
  useEffect(() => {
    const handle = window.setTimeout(
      () => setFilters((current) => ({ ...current, search: searchInput })),
      300,
    );
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  // Selected asset left the current view (e.g. moved to trash): close it.
  useEffect(() => {
    if (selectedId && assetsQuery.isSuccess && !selected) setSelectedId(null);
  }, [assetsQuery.isSuccess, selected, selectedId]);

  const showView = (next: Partial<LibraryFilters>) => {
    setFolderForm(null);
    setFilters((current) => ({
      ...current,
      folderId: "",
      favorite: false,
      trashed: false,
      tag: "",
      ...next,
    }));
  };

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const list = [...files];
    const failures: string[] = [];
    for (const [index, file] of list.entries()) {
      setUploadProgress(
        list.length > 1 ? `Enviando ${index + 1} de ${list.length}…` : "Enviando…",
      );
      try {
        await mutations.upload.mutateAsync({ file, folderId: activeFolder || undefined });
      } catch (uploadError) {
        failures.push(`${file.name}: ${errorMessage(uploadError, "falha no envio")}`);
      }
    }
    setUploadProgress("");
    if (uploadInput.current) uploadInput.current.value = "";
    if (failures.length) setError(failures.join(" · "));
  }

  async function submitFolderForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderForm) return;
    setError("");
    try {
      if (folderForm.mode === "create") {
        await mutations.createFolder.mutateAsync({
          name: folderForm.name.trim(),
          parentId: activeFolder || null,
        });
      } else if (folderForm.mode === "rename") {
        await mutations.updateFolder.mutateAsync({ id: activeFolder, name: folderForm.name.trim() });
      } else {
        await mutations.updateFolder.mutateAsync({
          id: activeFolder,
          parentId: folderForm.parentId || null,
        });
      }
      setFolderForm(null);
    } catch (folderError) {
      setError(
        errorMessage(folderError, "").includes("already exists")
          ? "Já existe uma pasta com esse nome neste local."
          : errorMessage(folderError, "Não foi possível salvar a pasta."),
      );
    }
  }

  async function deleteActiveFolder() {
    setError("");
    try {
      const parentId = path.at(-2)?.id ?? "";
      await mutations.deleteFolder.mutateAsync(activeFolder);
      showView({ folderId: parentId });
    } catch (folderError) {
      setError(
        errorMessage(folderError, "").includes("Only empty folders")
          ? "Só é possível excluir pastas vazias. Mova ou exclua o conteúdo e as subpastas antes."
          : errorMessage(folderError, "Não foi possível excluir a pasta."),
      );
    }
  }

  async function toggleFavorite(asset: Asset) {
    setError("");
    try {
      await mutations.toggleFavorite.mutateAsync(asset.id);
    } catch (favoriteError) {
      setError(errorMessage(favoriteError, "Não foi possível atualizar o favorito."));
    }
  }

  async function restore(asset: Asset) {
    setError("");
    try {
      await mutations.restore.mutateAsync(asset.id);
    } catch (restoreError) {
      setError(errorMessage(restoreError, "Não foi possível restaurar o ativo."));
    }
  }

  const title = filters.trashed
    ? "Lixeira"
    : activeFolder
      ? (path.at(-1)?.name ?? "Pasta")
      : filters.favorite
        ? "Favoritos"
        : filters.tag
          ? `Tag: ${filters.tag}`
          : "Todos os ativos";

  const moveTargets = useMemo(
    () => (activeFolder ? folderOptions(folders, activeFolder) : []),
    [activeFolder, folders],
  );

  if (!ready) return null;
  if (!accessToken || !teamId) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
        Entre na plataforma e selecione uma equipe para carregar a biblioteca.
      </p>
    );
  }

  const navButton = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
      active ? "bg-primary/15 text-white" : "text-muted hover:bg-white/5 hover:text-white"
    }`;

  return (
    <div className="relative rounded-[28px] border border-border bg-surface/90 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="border-b border-border px-5 py-6 md:px-7">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-secondary">Biblioteca central</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Mídia e ativos</h2>
            <p className="mt-1 text-sm text-muted">
              Organize, encontre e acompanhe seus arquivos de mídia.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={uploadInput}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => void uploadFiles(event.target.files)}
            />
            <button
              type="button"
              onClick={() => uploadInput.current?.click()}
              disabled={Boolean(uploadProgress) || filters.trashed}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/15 transition hover:bg-primary/90 disabled:opacity-50"
            >
              {uploadProgress || "+ Enviar mídia"}
            </button>
            <button
              type="button"
              onClick={() => setFolderForm({ mode: "create", name: "", parentId: "" })}
              disabled={filters.trashed}
              className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-white transition hover:bg-white/5 disabled:opacity-50"
            >
              {activeFolder ? "Nova subpasta" : "Nova pasta"}
            </button>
            <button
              type="button"
              onClick={() => void assetsQuery.refetch()}
              disabled={assetsQuery.isFetching}
              aria-label="Atualizar biblioteca"
              title="Atualizar"
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-muted transition hover:text-white disabled:opacity-50"
            >
              ↻
            </button>
          </div>
        </div>
        {folderForm && (
          <form
            onSubmit={(event) => void submitFolderForm(event)}
            className="mt-5 flex max-w-xl flex-wrap gap-2 rounded-2xl border border-border bg-background p-3"
          >
            {folderForm.mode === "move" ? (
              <select
                value={folderForm.parentId}
                onChange={(event) => setFolderForm({ ...folderForm, parentId: event.target.value })}
                aria-label="Nova pasta de destino"
                className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-white"
              >
                <option value="">Biblioteca (raiz)</option>
                {moveTargets.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                required
                autoFocus
                maxLength={120}
                value={folderForm.name}
                onChange={(event) => setFolderForm({ ...folderForm, name: event.target.value })}
                placeholder={
                  folderForm.mode === "rename"
                    ? "Novo nome da pasta"
                    : activeFolder
                      ? `Subpasta em ${path.at(-1)?.name}`
                      : "Nome da nova pasta"
                }
                aria-label="Nome da pasta"
                className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-white placeholder:text-muted"
              />
            )}
            <button
              disabled={
                mutations.createFolder.isPending ||
                mutations.updateFolder.isPending ||
                (folderForm.mode !== "move" && !folderForm.name.trim())
              }
              className="rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {folderForm.mode === "create" ? "Criar pasta" : folderForm.mode === "rename" ? "Renomear" : "Mover pasta"}
            </button>
            <button
              type="button"
              onClick={() => setFolderForm(null)}
              className="rounded-xl border border-border px-3 py-2 text-sm text-muted hover:text-white"
            >
              Cancelar
            </button>
          </form>
        )}
      </div>

      {(error || assetsQuery.isError) && (
        <p
          role="alert"
          className="mx-5 mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 md:mx-7"
        >
          {error || errorMessage(assetsQuery.error, "Não foi possível carregar a biblioteca.")}
        </p>
      )}

      <div className="grid min-h-[560px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-border p-4 lg:border-b-0 lg:border-r">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Biblioteca
          </p>
          <button
            type="button"
            onClick={() => showView({})}
            className={navButton(!filters.trashed && !filters.favorite && !activeFolder && !filters.tag)}
          >
            <span aria-hidden="true">▦</span>
            <span className="flex-1">Todos os ativos</span>
          </button>
          <button
            type="button"
            onClick={() => showView({ favorite: true })}
            className={`mt-1 ${navButton(filters.favorite)}`}
          >
            <span aria-hidden="true" className="text-amber-300">★</span>
            <span className="flex-1">Favoritos</span>
          </button>
          <button
            type="button"
            onClick={() => showView({ trashed: true })}
            className={`mt-1 ${navButton(filters.trashed)}`}
          >
            <span aria-hidden="true">▱</span>
            <span className="flex-1">Lixeira</span>
          </button>

          <div className="mb-2 mt-7 flex items-center justify-between px-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Pastas</p>
            <button
              type="button"
              onClick={() => {
                showView({});
                setFolderForm({ mode: "create", name: "", parentId: "" });
              }}
              aria-label="Criar pasta na raiz"
              title="Criar pasta na raiz"
              className="text-lg leading-none text-muted hover:text-white"
            >
              +
            </button>
          </div>
          <FolderTree
            folders={folders}
            activeFolder={activeFolder}
            onSelect={(id) => showView({ folderId: id })}
          />
          {foldersQuery.isSuccess && folders.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted/70">Suas pastas aparecerão aqui.</p>
          )}

          {tags.length > 0 && (
            <>
              <p className="mb-2 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                Tags
              </p>
              <div className="flex flex-wrap gap-1.5 px-2">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => showView({ tag: tag.name })}
                    aria-pressed={filters.tag === tag.name}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      filters.tag === tag.name
                        ? "border-secondary/60 bg-secondary/15 text-secondary"
                        : "border-border text-muted hover:text-white"
                    }`}
                  >
                    {tag.name} <span className="text-muted/70">{tag.assetCount}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        <main className="min-w-0 p-4 md:p-6">
          <div className="mb-5 flex flex-col gap-4">
            <nav aria-label="Caminho da pasta" className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
              <button type="button" onClick={() => showView({})} className="shrink-0 text-muted hover:text-white">
                Biblioteca
              </button>
              {filters.trashed ? (
                <>
                  <span className="text-muted/50">/</span>
                  <span className="truncate text-white">Lixeira</span>
                </>
              ) : (
                path.map((folder, index) => (
                  <span key={folder.id} className="flex min-w-0 items-center gap-2">
                    <span className="text-muted/50">/</span>
                    {index === path.length - 1 ? (
                      <span className="truncate text-white">{folder.name}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => showView({ folderId: folder.id })}
                        className="truncate text-muted hover:text-white"
                      >
                        {folder.name}
                      </button>
                    )}
                  </span>
                ))
              )}
              {activeFolder && (
                <span className="ml-auto flex gap-1">
                  {(
                    [
                      ["rename", "Renomear"],
                      ["move", "Mover"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() =>
                        setFolderForm({
                          mode,
                          name: mode === "rename" ? (path.at(-1)?.name ?? "") : "",
                          parentId: path.at(-2)?.id ?? "",
                        })
                      }
                      className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-white"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void deleteActiveFolder()}
                    disabled={mutations.deleteFolder.isPending}
                    className="rounded-lg border border-rose-500/25 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    Excluir pasta
                  </button>
                </span>
              )}
            </nav>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <p className="mt-1 text-xs text-muted">
                  {assets.length} {assets.length === 1 ? "arquivo" : "arquivos"}
                  {filters.trashed
                    ? " na lixeira"
                    : activeFolder
                      ? " nesta pasta e subpastas"
                      : ""}
                  {filters.search ? ` para “${filters.search}”` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Buscar por nome, tag ou pasta"
                  aria-label="Buscar ativos"
                  className="min-w-[180px] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-white placeholder:text-muted md:w-64 md:flex-none"
                />
                <select
                  value={filters.kind}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, kind: event.target.value as AssetKind | "" }))
                  }
                  aria-label="Filtrar por tipo"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-white"
                >
                  <option value="">Todos os tipos</option>
                  {Object.entries(kindLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <div className="flex rounded-xl border border-border bg-background p-1">
                  {(["Grid", "Lista"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setViewMode(option)}
                      aria-pressed={viewMode === option}
                      className={`rounded-lg px-3 py-1.5 text-xs ${
                        viewMode === option ? "bg-primary text-white" : "text-muted"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {assetsQuery.isPending ? (
            <p className="text-xs text-muted">Carregando biblioteca…</p>
          ) : assets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
              <span aria-hidden="true" className="text-3xl text-muted/70">
                {filters.trashed ? "▱" : "▧"}
              </span>
              <p className="mt-3 text-sm font-medium text-white">
                {filters.trashed
                  ? "A lixeira está vazia"
                  : filters.search
                    ? "Nenhum arquivo corresponde à busca"
                    : "Nenhum arquivo nesta visualização"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {filters.trashed
                  ? "Arquivos excluídos aparecerão aqui até serem restaurados ou removidos."
                  : "Envie mídias ou organize seus arquivos em pastas."}
              </p>
            </div>
          ) : viewMode === "Grid" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              {assets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  trashed={filters.trashed}
                  onOpen={() => setSelectedId(asset.id)}
                  onFavorite={() => void toggleFavorite(asset)}
                  onRestore={() => void restore(asset)}
                />
              ))}
            </div>
          ) : (
            <AssetTable
              assets={assets}
              trashed={filters.trashed}
              onOpen={(asset) => setSelectedId(asset.id)}
              onRestore={(asset) => void restore(asset)}
            />
          )}
        </main>
      </div>

      {selected && (
        <AssetDetailsDrawer
          key={selected.id}
          asset={selected}
          folders={folders}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function AssetCard({
  asset,
  trashed,
  onOpen,
  onFavorite,
  onRestore,
}: {
  asset: Asset;
  trashed: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  onRestore: () => void;
}) {
  return (
    <article className="group relative min-w-0 overflow-hidden rounded-2xl border border-border bg-background transition hover:border-primary/60 hover:shadow-[0_12px_40px_rgba(0,0,0,0.25)] focus-within:ring-2 focus-within:ring-primary">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir detalhes de ${asset.displayName}`}
        className="block w-full text-left focus:outline-none"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-border">
          <AssetThumbnail asset={asset} />
          <span className="absolute left-3 top-3 rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white/90 backdrop-blur">
            {kindLabels[asset.kind]}
          </span>
          <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white/90 backdrop-blur">
            {formatBytes(asset.blob.sizeBytes)}
          </span>
        </div>
        <div className="p-4">
          <p className="truncate font-medium text-white" title={asset.displayName}>
            {asset.displayName}
          </p>
          <p className="mt-1 truncate text-xs text-muted" title={asset.filename}>
            {asset.filename}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs text-muted">
            <span className="truncate">{asset.folder?.name ?? "Raiz"}</span>
            <span className="shrink-0">
              {new Date(trashed && asset.deletedAt ? asset.deletedAt : asset.createdAt).toLocaleDateString("pt-BR")}
            </span>
          </div>
        </div>
      </button>
      {trashed ? (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onRestore}
            className="w-full rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-white hover:bg-primary/20"
          >
            Restaurar
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label={asset.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-pressed={asset.isFavorite}
          onClick={onFavorite}
          className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 text-lg backdrop-blur transition hover:bg-black/80 ${
            asset.isFavorite ? "text-amber-300" : "text-white/60"
          }`}
        >
          ★
        </button>
      )}
    </article>
  );
}

function AssetTable({
  assets,
  trashed,
  onOpen,
  onRestore,
}: {
  assets: Asset[];
  trashed: boolean;
  onOpen: (asset: Asset) => void;
  onRestore: (asset: Asset) => void;
}) {
  const columns = "md:grid-cols-[minmax(0,1.8fr)_0.6fr_0.6fr_0.8fr_auto]";
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className={`hidden border-b border-border bg-surface px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-muted md:grid ${columns}`}>
        <span>Ativo</span>
        <span>Tipo</span>
        <span>Tamanho</span>
        <span>{trashed ? "Excluído" : "Adicionado"}</span>
        <span className="w-20" />
      </div>
      {assets.map((asset) => (
        <div
          key={asset.id}
          className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 text-sm text-white last:border-b-0 hover:bg-white/[0.03] ${columns}`}
        >
          <button
            type="button"
            onClick={() => onOpen(asset)}
            className="flex min-w-0 items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-border">
              <AssetThumbnail asset={asset} compact />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{asset.displayName}</span>
              <span className="block truncate text-xs text-muted">{asset.filename}</span>
            </span>
          </button>
          <span className="hidden text-muted md:block">{kindLabels[asset.kind]}</span>
          <span className="hidden text-muted md:block">{formatBytes(asset.blob.sizeBytes)}</span>
          <span className="hidden text-muted md:block">
            {new Date(trashed && asset.deletedAt ? asset.deletedAt : asset.createdAt).toLocaleDateString("pt-BR")}
          </span>
          <span className="flex w-20 justify-end">
            {trashed ? (
              <button
                type="button"
                onClick={() => onRestore(asset)}
                className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs text-white"
              >
                Restaurar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpen(asset)}
                className="rounded-lg px-2 py-1 text-xs text-muted hover:text-white"
              >
                Detalhes ›
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
