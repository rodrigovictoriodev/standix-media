"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { io, type Socket } from "socket.io-client";
import { apiRequest, getSocketUrl } from "@/lib/api";
import { useApiSession } from "@/lib/use-api-session";
import {
  PresentationSlideRenderer,
  type PresentationSlide,
} from "./presentation-slide-renderer";

type Presentation = {
  id: string;
  title: string;
  description?: string | null;
  activeSlideId?: string | null;
  slides: PresentationSlide[];
  activeSlide?: PresentationSlide | null;
};

type MediaAsset = {
  id: string;
  filename: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
};

const slideTypes = ["TEXT", "IMAGE", "VIDEO", "HTML"] as const;

export function PresentationStudio() {
  const { accessToken: token, teamId } = useApiSession();
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedSlideId, setSelectedSlideId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draggedId, setDraggedId] = useState("");

  const presentation =
    presentations.find((item) => item.id === selectedId) ?? null;
  const selectedSlide =
    presentation?.slides.find((slide) => slide.id === selectedSlideId) ?? null;
  const activeSlide =
    presentation?.slides.find(
      (slide) => slide.id === presentation.activeSlideId,
    ) ?? null;
  const sortedSlides = useMemo(
    () =>
      [...(presentation?.slides ?? [])].sort(
        (left, right) => left.orderIndex - right.orderIndex,
      ),
    [presentation?.slides],
  );

  const api = useCallback(
    <T,>(path: string, init: RequestInit = {}) => apiRequest<T>(path, init),
    [],
  );

  const loadPresentations = useCallback(async () => {
    const items = await api<Presentation[]>("/presentations");
    setPresentations(items);
    setSelectedId((current) =>
      items.some((item) => item.id === current) ? current : items[0]?.id || "",
    );
    const mediaAssets = await api<MediaAsset[]>("/assets");
    setAssets(
      mediaAssets.filter(
        (asset) => asset.kind === "IMAGE" || asset.kind === "VIDEO",
      ),
    );
  }, [api]);

  useEffect(() => {
    if (!token || !teamId) {
      setPresentations([]);
      setAssets([]);
      setSelectedId("");
      setSelectedSlideId("");
      return;
    }
    void loadPresentations().catch((loadError: unknown) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar apresentações",
      );
    });
  }, [loadPresentations, teamId, token]);

  useEffect(() => {
    if (!selectedId || !token) return;
    const socket: Socket = io(getSocketUrl(), {
      auth: { accessToken: token },
      reconnection: true,
    });
    socket.on("connect", () =>
      socket.emit("presentation:join", { presentationId: selectedId }),
    );
    socket.on("presentation:update", (updated: Presentation) => {
      if (updated.id === selectedId) {
        setPresentations((items) =>
          items.map((item) => (item.id === updated.id ? updated : item)),
        );
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [selectedId, token]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "A operação falhou",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createPresentation() {
    if (!newTitle.trim()) throw new Error("Informe o título da apresentação.");
    const created = await api<Presentation>("/presentations", {
      method: "POST",
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setNewTitle("");
    setPresentations((items) => [created, ...items]);
    setSelectedId(created.id);
  }

  useEffect(() => {
    if (!selectedSlideId && presentation?.slides[0]) {
      setSelectedSlideId(presentation.slides[0].id);
    }
  }, [presentation, selectedSlideId]);

  async function createSlide(type: (typeof slideTypes)[number]) {
    if (!presentation) return;
    const created = await api<PresentationSlide>(
      `/presentations/${presentation.id}/slides`,
      {
        method: "POST",
        body: JSON.stringify({
          type,
          content:
            type === "TEXT"
              ? { text: "Novo slide", background: "#0B1020", color: "#FFFFFF" }
              : {},
          layout: { fit: "contain" },
        }),
      },
    );
    setPresentations((items) =>
      items.map((item) =>
        item.id === presentation.id
          ? {
              ...item,
              // The realtime broadcast may have added this slide already.
              slides: item.slides.some((slide) => slide.id === created.id)
                ? item.slides
                : [...item.slides, created],
              activeSlideId: item.activeSlideId ?? created.id,
            }
          : item,
      ),
    );
    setSelectedSlideId(created.id);
  }

  async function saveSlide() {
    if (!presentation || !selectedSlide) return;
    const content = {
      ...selectedSlide.content,
      ...(selectedSlide.type === "TEXT"
        ? { text: String(selectedSlide.content.text ?? "") }
        : {}),
    };
    const updated = await api<PresentationSlide>(
      `/presentations/${presentation.id}/slides/${selectedSlide.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          type: selectedSlide.type,
          content,
          assetId: selectedSlide.assetId ?? null,
        }),
      },
    );
    setPresentations((items) =>
      items.map((item) =>
        item.id === presentation.id
          ? {
              ...item,
              slides: item.slides.map((slide) =>
                slide.id === updated.id ? updated : slide,
              ),
            }
          : item,
      ),
    );
  }

  async function reorder(droppedId: string) {
    if (!presentation || !draggedId || draggedId === droppedId) return;
    const next = [...sortedSlides];
    const from = next.findIndex((slide) => slide.id === draggedId);
    const to = next.findIndex((slide) => slide.id === droppedId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const reordered = next.map((slide, orderIndex) => ({
      ...slide,
      orderIndex,
    }));
    setDraggedId("");
    const updated = await api<Presentation>(
      `/presentations/${presentation.id}/slides/order`,
      {
        method: "PATCH",
        body: JSON.stringify({ slideIds: reordered.map((slide) => slide.id) }),
      },
    );
    setPresentations((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  async function activateSlide(slideId: string) {
    if (!presentation) return;
    const updated = await api<Presentation>(
      `/presentations/${presentation.id}/active-slide`,
      {
        method: "PATCH",
        body: JSON.stringify({ slideId }),
      },
    );
    setPresentations((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  async function deleteSlide(slideId: string) {
    if (!presentation) return;
    await api(`/presentations/${presentation.id}/slides/${slideId}`, {
      method: "DELETE",
    });
    setPresentations((items) =>
      items.map((item) =>
        item.id === presentation.id
          ? {
              ...item,
              slides: item.slides.filter((slide) => slide.id !== slideId),
            }
          : item,
      ),
    );
    if (selectedSlideId === slideId) setSelectedSlideId("");
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-secondary">
            Engine nativa
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Apresentações</h2>
          <p className="mt-1 text-sm text-muted">
            Slides nativos, conteúdo em tempo real e saída para projeção.
          </p>
        </div>
        <div>
          <button
            onClick={() => void run(loadPresentations)}
            disabled={busy || !token || !teamId}
            className="rounded-xl border border-primary/40 bg-primary/15 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Conectar
          </button>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          {error}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-3xl border border-border bg-surface p-4">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(createPresentation);
            }}
          >
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Nova apresentação"
              disabled={!token || !teamId}
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs"
            />
            <button
              aria-label="Criar apresentação"
              disabled={busy || !token || !teamId}
              className="rounded-xl bg-primary px-3 text-white disabled:opacity-50"
            >
              +
            </button>
          </form>
          <div className="space-y-2">
            {presentations.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  setSelectedSlideId(item.slides[0]?.id ?? "");
                }}
                className={`w-full rounded-xl border p-3 text-left ${item.id === selectedId ? "border-primary/50 bg-primary/10" : "border-border bg-background"}`}
              >
                <span className="block truncate text-sm font-medium text-white">
                  {item.title}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {item.slides.length} slides
                </span>
              </button>
            ))}
            {presentations.length === 0 && (
              <p className="px-2 py-4 text-xs text-muted">
                Nenhuma apresentação encontrada.
              </p>
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          {!presentation ? (
            <div className="rounded-3xl border border-border bg-surface p-10 text-center text-sm text-muted">
              Conecte sua equipe ou crie uma apresentação para começar.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
                <div>
                  <h3 className="font-semibold text-white">
                    {presentation.title}
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    Formato {presentation ? "nativo" : ""} ·{" "}
                    {presentation.slides.length} slides
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {slideTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => void run(() => createSlide(type))}
                      disabled={busy}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-white hover:border-primary"
                    >
                      + {type}
                    </button>
                  ))}
                  <Link
                    href={`/presentations/${presentation.id}/play`}
                    target="_blank"
                    className="rounded-lg border border-secondary/40 bg-secondary/10 px-3 py-2 text-xs text-secondary"
                  >
                    Abrir player ↗
                  </Link>
                  <Link
                    href={`/screen/main?presentation=${presentation.id}`}
                    target="_blank"
                    className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-white"
                  >
                    Projetar em /screen/main ↗
                  </Link>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(180px,0.55fr)_minmax(0,1.45fr)]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1 text-xs text-muted">
                    <span>Slides</span>
                    <span>Arraste para ordenar</span>
                  </div>
                  {sortedSlides.map((slide, index) => (
                    <div
                      key={slide.id}
                      draggable
                      onDragStart={() => setDraggedId(slide.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => void run(() => reorder(slide.id))}
                      className={`cursor-grab rounded-xl border p-2 ${selectedSlideId === slide.id ? "border-primary/50 bg-primary/10" : "border-border bg-surface"}`}
                    >
                      <button
                        className="w-full text-left"
                        onClick={() => setSelectedSlideId(slide.id)}
                      >
                        <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                          <PresentationSlideRenderer
                            slide={slide}
                            teamId={teamId}
                            token={token}
                            compact
                          />
                        </div>
                        <span className="text-xs text-muted">
                          {String(index + 1).padStart(2, "0")} · {slide.type}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="overflow-hidden rounded-2xl border border-border bg-black">
                    <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 text-xs text-muted">
                      <span>Preview ao vivo</span>
                      <span>
                        {activeSlide
                          ? `Slide ${activeSlide.orderIndex + 1}`
                          : "Sem slide ativo"}
                      </span>
                    </div>
                    <div className="aspect-video">
                      <PresentationSlideRenderer
                        slide={activeSlide}
                        teamId={teamId}
                        token={token}
                      />
                    </div>
                  </div>

                  {selectedSlide && (
                    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-white">
                          Editar slide · {selectedSlide.type}
                        </h4>
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              void run(() => activateSlide(selectedSlide.id))
                            }
                            disabled={busy}
                            className="rounded-lg bg-primary px-3 py-2 text-xs text-white"
                          >
                            Exibir
                          </button>
                          <button
                            onClick={() =>
                              void run(() => deleteSlide(selectedSlide.id))
                            }
                            disabled={busy}
                            className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs text-rose-200"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                      {selectedSlide.type === "TEXT" && (
                        <textarea
                          value={String(selectedSlide.content.text ?? "")}
                          onChange={(event) => {
                            const text = event.target.value;
                            setPresentations((items) =>
                              items.map((item) =>
                                item.id === presentation.id
                                  ? {
                                      ...item,
                                      slides: item.slides.map((slide) =>
                                        slide.id === selectedSlide.id
                                          ? {
                                              ...slide,
                                              content: {
                                                ...slide.content,
                                                text,
                                              },
                                            }
                                          : slide,
                                      ),
                                    }
                                  : item,
                              ),
                            );
                          }}
                          rows={4}
                          placeholder="Texto do slide"
                          className="w-full rounded-xl border border-border bg-background p-3 text-sm text-white"
                        />
                      )}
                      {(selectedSlide.type === "IMAGE" ||
                        selectedSlide.type === "VIDEO") && (
                        <select
                          value={selectedSlide.assetId ?? ""}
                          onChange={(event) => {
                            const assetId = event.target.value || null;
                            setPresentations((items) =>
                              items.map((item) =>
                                item.id === presentation.id
                                  ? {
                                      ...item,
                                      slides: item.slides.map((slide) =>
                                        slide.id === selectedSlide.id
                                          ? { ...slide, assetId }
                                          : slide,
                                      ),
                                    }
                                  : item,
                              ),
                            );
                          }}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-white"
                        >
                          <option value="">
                            Selecione um arquivo de mídia
                          </option>
                          {assets
                            .filter(
                              (asset) => asset.kind === selectedSlide.type,
                            )
                            .map((asset) => (
                              <option key={asset.id} value={asset.id}>
                                {asset.filename}
                              </option>
                            ))}
                        </select>
                      )}
                      {selectedSlide.type === "HTML" && (
                        <textarea
                          value={String(selectedSlide.content.html ?? "")}
                          onChange={(event) => {
                            const html = event.target.value;
                            setPresentations((items) =>
                              items.map((item) =>
                                item.id === presentation.id
                                  ? {
                                      ...item,
                                      slides: item.slides.map((slide) =>
                                        slide.id === selectedSlide.id
                                          ? {
                                              ...slide,
                                              content: {
                                                ...slide.content,
                                                html,
                                              },
                                            }
                                          : slide,
                                      ),
                                    }
                                  : item,
                              ),
                            );
                          }}
                          rows={5}
                          placeholder="<h1>HTML do slide</h1>"
                          className="w-full rounded-xl border border-border bg-background p-3 font-mono text-xs"
                        />
                      )}
                      <button
                        onClick={() => void run(saveSlide)}
                        disabled={busy}
                        className="rounded-lg border border-border px-3 py-2 text-xs text-white"
                      >
                        Salvar alterações
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
