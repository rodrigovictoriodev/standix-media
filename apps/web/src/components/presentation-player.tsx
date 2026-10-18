"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { apiRequest, getSocketUrl } from "@/lib/api";
import { useApiSession } from "@/lib/use-api-session";
import {
  PresentationSlideRenderer,
  type PresentationSlide,
} from "./presentation-slide-renderer";

type PresentationData = {
  id: string;
  title: string;
  activeSlideId?: string | null;
  slides: PresentationSlide[];
};

export function PresentationPlayer({
  presentationId,
  chromeless = false,
}: {
  presentationId: string;
  chromeless?: boolean;
}) {
  const [presentation, setPresentation] = useState<PresentationData | null>(
    null,
  );
  const { accessToken: token, teamId } = useApiSession();
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token || !teamId) {
      setPresentation(null);
      setError("");
      return;
    }
    let cancelled = false;
    void apiRequest<PresentationData>(
      `/presentations/${encodeURIComponent(presentationId)}`,
    )
      .then((result) => {
        if (!cancelled) setPresentation(result);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Falha ao carregar apresentação",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [presentationId, teamId, token]);

  useEffect(() => {
    if (!token) return;
    const socket = io(getSocketUrl(), {
      auth: { accessToken: token },
      reconnection: true,
    });
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("presentation:join", { presentationId });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("presentation:update", (updated: PresentationData) => {
      if (updated.id === presentationId) setPresentation(updated);
    });
    socket.on("connect_error", () => setConnected(false));
    return () => {
      socket.disconnect();
    };
  }, [presentationId, token]);

  const activeSlide =
    presentation?.slides.find(
      (slide) => slide.id === presentation.activeSlideId,
    ) ?? null;

  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
      <header
        className={`${chromeless ? "hidden" : "flex"} items-center justify-between border-b border-white/10 px-5 py-3`}
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-secondary">
            Standix · Presentation Player
          </p>
          <h1 className="mt-1 text-sm font-medium">
            {presentation?.title ?? "Carregando apresentação…"}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/60">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400"}`}
          />
          {connected ? "Sincronizado" : "Reconectando"}
          <button
            onClick={() => void document.documentElement.requestFullscreen?.()}
            className="rounded-lg border border-white/15 px-3 py-2 text-white/80"
          >
            Tela cheia
          </button>
        </div>
      </header>
      <section className="flex flex-1 items-center justify-center">
        {error ? (
          <p
            role="alert"
            className="max-w-xl px-6 text-center text-sm text-rose-200"
          >
            {error}
          </p>
        ) : !teamId || !token ? (
          <p className="px-6 text-center text-sm text-white/60">
            Entre na plataforma e selecione uma equipe antes de abrir o player.
          </p>
        ) : (
          <PresentationSlideRenderer
            slide={activeSlide}
            teamId={teamId}
            token={token}
          />
        )}
      </section>
      <footer
        className={`${chromeless ? "hidden" : ""} border-t border-white/10 px-5 py-2 text-right text-xs text-white/40`}
      >
        {activeSlide
          ? `${activeSlide.orderIndex + 1} / ${presentation?.slides.length ?? 0}`
          : "Aguardando slide"}
      </footer>
    </main>
  );
}
