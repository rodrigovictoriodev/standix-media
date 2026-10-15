"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiRequestError } from "@/lib/api";
import { AssetThumbnail } from "./asset-thumbnail";
import { folderOptions } from "./folder-tree";
import {
  errorMessage,
  folderPath,
  formatBytes,
  formatDate,
  formatDuration,
  kindLabels,
  referenceLabels,
  type Asset,
  type AssetFolder,
} from "./types";
import {
  downloadAsset,
  useAssetDetail,
  useAssetOriginalUrl,
  useLibraryMutations,
} from "./use-library";

export function AssetDetailsDrawer({
  asset: listedAsset,
  folders,
  onClose,
}: {
  asset: Asset;
  folders: AssetFolder[];
  onClose: () => void;
}) {
  const detail = useAssetDetail(listedAsset.id);
  const asset = detail.data ?? listedAsset;
  const trashed = Boolean(asset.deletedAt);
  const references = detail.data?.references;
  const mutations = useLibraryMutations();
  const [name, setName] = useState(asset.displayName);
  const [folderId, setFolderId] = useState(asset.folderId ?? "");
  const [tagInput, setTagInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setName(asset.displayName);
    setFolderId(asset.folderId ?? "");
  }, [asset.displayName, asset.folderId]);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const busy = Object.values(mutations).some((mutation) => mutation.isPending);

  async function run(action: () => Promise<unknown>, success: string, fallback: string) {
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      return true;
    } catch (actionError) {
      setError(errorMessage(actionError, fallback));
      return false;
    }
  }

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(
      () => mutations.update.mutateAsync({ id: asset.id, displayName: name.trim() }),
      "Nome atualizado.",
      "Não foi possível renomear o ativo.",
    );
  }

  function move() {
    void run(
      () => mutations.update.mutateAsync({ id: asset.id, folderId: folderId || null }),
      folderId ? "Ativo movido para a pasta." : "Ativo movido para a raiz.",
      "Não foi possível mover o ativo.",
    );
  }

  function saveTags(tags: string[]) {
    void run(
      () => mutations.setTags.mutateAsync({ id: asset.id, tags }),
      "Tags atualizadas.",
      "Não foi possível atualizar as tags.",
    );
  }

  function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = tagInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (!next.length) return;
    setTagInput("");
    saveTags([...asset.tags.map((tag) => tag.name), ...next]);
  }

  async function permanentlyDelete() {
    setError("");
    try {
      await mutations.destroy.mutateAsync(asset.id);
      onClose();
    } catch (deleteError) {
      setConfirmDelete(false);
      setError(
        deleteError instanceof ApiRequestError && deleteError.status === 409
          ? "Este ativo ainda é usado (veja Referências). Remova o uso antes de excluir definitivamente."
          : errorMessage(deleteError, "Não foi possível excluir o ativo."),
      );
    }
  }

  const path = folderPath(folders, asset.folderId);
  const duration = formatDuration(asset.metadata.durationSeconds);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fechar detalhes do ativo"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-details-title"
        className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-surface shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface px-6 py-5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-secondary">
              Detalhes do ativo
            </p>
            <h2
              id="asset-details-title"
              className="mt-1 truncate text-lg font-semibold text-white"
              title={asset.displayName}
            >
              {asset.displayName}
            </h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted hover:bg-white/5 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="space-y-7 p-6">
          <AssetPreview asset={asset} />

          <div className="flex flex-wrap gap-2">
            {!trashed && (
              <ActionButton
                onClick={() =>
                  void run(
                    () => mutations.toggleFavorite.mutateAsync(asset.id),
                    asset.isFavorite ? "Removido dos favoritos." : "Adicionado aos favoritos.",
                    "Não foi possível atualizar o favorito.",
                  )
                }
                disabled={busy}
                pressed={asset.isFavorite}
              >
                <span className={asset.isFavorite ? "text-amber-300" : ""}>★</span>
                {asset.isFavorite ? "Favorito" : "Favoritar"}
              </ActionButton>
            )}
            <ActionButton
              onClick={() =>
                void run(() => downloadAsset(asset.id), "Download iniciado.", "Não foi possível baixar o arquivo.")
              }
              disabled={busy}
            >
              ↓ Baixar
            </ActionButton>
            {trashed ? (
              <ActionButton
                onClick={() =>
                  void run(
                    () => mutations.restore.mutateAsync(asset.id),
                    "Ativo restaurado.",
                    "Não foi possível restaurar o ativo.",
                  )
                }
                disabled={busy}
                tone="primary"
              >
                ↺ Restaurar
              </ActionButton>
            ) : (
              <ActionButton
                onClick={() =>
                  void run(
                    () => mutations.trash.mutateAsync(asset.id),
                    "Ativo movido para a lixeira.",
                    "Não foi possível mover o ativo para a lixeira.",
                  ).then((ok) => ok && onClose())
                }
                disabled={busy}
                tone="danger"
              >
                Excluir
              </ActionButton>
            )}
          </div>

          {(error || notice) && (
            <p
              role={error ? "alert" : "status"}
              className={`rounded-xl border p-3 text-sm ${
                error
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                  : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"
              }`}
            >
              {error || notice}
            </p>
          )}

          {trashed ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
              Na lixeira desde {formatDate(asset.deletedAt!)}. Restaure para renomear, mover ou
              editar tags.
              <div className="mt-3">
                {confirmDelete ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Excluir definitivamente? Não pode ser desfeito.</span>
                    <ActionButton onClick={() => void permanentlyDelete()} disabled={busy} tone="danger">
                      Confirmar exclusão
                    </ActionButton>
                    <ActionButton onClick={() => setConfirmDelete(false)} disabled={busy}>
                      Cancelar
                    </ActionButton>
                  </div>
                ) : (
                  <ActionButton onClick={() => setConfirmDelete(true)} disabled={busy} tone="danger">
                    Excluir definitivamente
                  </ActionButton>
                )}
              </div>
            </div>
          ) : (
            <section className="space-y-4">
              <form onSubmit={rename}>
                <label htmlFor="asset-name" className="mb-1.5 block text-xs font-medium text-muted">
                  Nome amigável
                </label>
                <div className="flex gap-2">
                  <input
                    id="asset-name"
                    required
                    maxLength={255}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-white focus:border-primary focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy || !name.trim() || name.trim() === asset.displayName}
                    className="rounded-xl bg-primary px-4 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Renomear
                  </button>
                </div>
              </form>

              <div>
                <label htmlFor="asset-folder" className="mb-1.5 block text-xs font-medium text-muted">
                  Pasta
                </label>
                <div className="flex gap-2">
                  <select
                    id="asset-folder"
                    value={folderId}
                    onChange={(event) => setFolderId(event.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-white"
                  >
                    <option value="">Biblioteca (raiz)</option>
                    {folderOptions(folders).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={move}
                    disabled={busy || folderId === (asset.folderId ?? "")}
                    className="rounded-xl border border-primary/40 bg-primary/10 px-4 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Mover
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {asset.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 rounded-full border border-secondary/30 bg-secondary/10 py-1 pl-3 pr-1 text-xs text-secondary"
                    >
                      {tag.name}
                      <button
                        type="button"
                        aria-label={`Remover tag ${tag.name}`}
                        disabled={busy}
                        onClick={() =>
                          saveTags(asset.tags.filter((item) => item.id !== tag.id).map((item) => item.name))
                        }
                        className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/10"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <form onSubmit={addTag} className="flex min-w-[160px] flex-1">
                    <input
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      placeholder="Adicionar tag e Enter"
                      aria-label="Adicionar tag"
                      maxLength={60}
                      className="w-full rounded-full border border-dashed border-border bg-transparent px-3 py-1 text-xs text-white placeholder:text-muted/70 focus:border-primary focus:outline-none"
                    />
                  </form>
                </div>
              </div>
            </section>
          )}

          <section className="border-t border-border pt-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Informações do arquivo
            </h3>
            <dl className="mt-4 space-y-3 text-sm">
              <Info label="Nome físico">{asset.filename}</Info>
              <Info label="Tipo">{kindLabels[asset.kind]}</Info>
              <Info label="MIME">{asset.blob.mimeType}</Info>
              {asset.metadata.resolution && <Info label="Dimensões">{`${asset.metadata.width} × ${asset.metadata.height} px`}</Info>}
              {duration && <Info label="Duração">{duration}</Info>}
              {asset.metadata.codec && <Info label="Codec / formato">{asset.metadata.codec}</Info>}
              <Info label="Tamanho">{formatBytes(asset.blob.sizeBytes)}</Info>
              <Info label="Pasta">
                {path.length ? path.map((folder) => folder.name).join(" / ") : "Biblioteca (raiz)"}
              </Info>
              <Info label="Criado em">{formatDate(asset.createdAt)}</Info>
              <Info label="Última alteração">{formatDate(asset.updatedAt)}</Info>
              <Info label="SHA-256">
                <span className="font-mono text-xs">{asset.blob.sha256}</span>
              </Info>
            </dl>
          </section>

          <section className="border-t border-border pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Referências
              </h3>
              <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-muted">
                {references?.length ?? "…"}
              </span>
            </div>
            {detail.isError ? (
              <p className="mt-3 text-sm text-rose-200">
                {errorMessage(detail.error, "Não foi possível carregar as referências.")}
              </p>
            ) : !references ? (
              <p className="mt-3 text-sm text-muted">Carregando referências…</p>
            ) : references.length ? (
              <ul className="mt-3 space-y-2">
                {references.map((reference) => (
                  <li
                    key={`${reference.type}:${reference.id}`}
                    className="rounded-xl border border-border bg-background px-4 py-3"
                  >
                    <p className="text-[10px] uppercase tracking-[0.16em] text-secondary">
                      {referenceLabels[reference.type]}
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">{reference.label}</p>
                    {reference.context && (
                      <p className="mt-0.5 text-xs text-muted">{reference.context}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
                Nenhuma apresentação, cena ou cue utiliza este ativo.
              </p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function AssetPreview({ asset }: { asset: Asset }) {
  const playable = asset.kind === "IMAGE" || asset.kind === "VIDEO" || asset.kind === "AUDIO";
  const original = useAssetOriginalUrl(asset.id, playable);
  const url = original.data;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-[#070b16]">
      {asset.kind === "IMAGE" && url ? (
        <img
          src={url}
          alt={asset.displayName}
          className="mx-auto max-h-[360px] w-full object-contain"
        />
      ) : asset.kind === "VIDEO" && url ? (
        <video
          src={url}
          poster={asset.thumbnailUrl ?? undefined}
          controls
          preload="metadata"
          className="max-h-[360px] w-full bg-black"
        />
      ) : (
        <div className="aspect-[16/10]">
          <AssetThumbnail asset={asset} />
        </div>
      )}
      {asset.kind === "AUDIO" && url && (
        <audio src={url} controls preload="metadata" className="w-full" />
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-all text-right text-white">{children}</dd>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  pressed,
  tone = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  tone?: "default" | "primary" | "danger";
}) {
  const tones = {
    default: "border-border bg-background text-white hover:bg-white/5",
    primary: "border-primary/40 bg-primary/10 text-white hover:bg-primary/20",
    danger: "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
