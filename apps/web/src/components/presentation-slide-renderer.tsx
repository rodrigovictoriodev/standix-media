"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

export type PresentationSlide = {
  id: string;
  type: "TEXT" | "IMAGE" | "VIDEO" | "HTML";
  orderIndex: number;
  thumbnailUrl?: string | null;
  assetId?: string | null;
  content: Record<string, unknown>;
  layout: Record<string, unknown>;
  asset?: {
    id: string;
    filename: string;
    kind: string;
    metadata?: Record<string, unknown>;
  } | null;
};

type Props = {
  slide?: PresentationSlide | null;
  teamId: string;
  token: string;
  compact?: boolean;
};

export function PresentationSlideRenderer({
  slide,
  teamId,
  token,
  compact = false,
}: Props) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMediaUrl(null);
    setMediaError(null);

    if (!slide?.assetId) return;

    if (!token || !teamId) return;

    void apiRequest<{ url: string }>(
      `/assets/${encodeURIComponent(slide.assetId)}/url`,
    )
      .then(({ url }) => {
        if (!cancelled) setMediaUrl(url);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMediaError(
            error instanceof Error
              ? error.message
              : "Falha ao carregar a mídia",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slide?.assetId, teamId, token]);

  if (!slide) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted">
        Selecione um slide para visualizar
      </div>
    );
  }

  const content = slide.content ?? {};
  const background =
    typeof content.background === "string" ? content.background : "#0B1020";
  const color = typeof content.color === "string" ? content.color : "#FFFFFF";
  const text = typeof content.text === "string" ? content.text : "";

  if (slide.type === "IMAGE" || slide.type === "VIDEO") {
    if (mediaError) {
      return <div className="p-4 text-sm text-rose-300">{mediaError}</div>;
    }
    if (!mediaUrl) {
      return (
        <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted">
          {slide.assetId
            ? "Carregando mídia…"
            : "Associe um arquivo da biblioteca"}
        </div>
      );
    }

    return slide.type === "IMAGE" ? (
      <img
        className="h-full w-full object-contain"
        src={mediaUrl}
        alt={slide.asset?.filename ?? "Slide image"}
      />
    ) : (
      <video
        className="h-full w-full object-contain"
        src={mediaUrl}
        autoPlay={!compact}
        muted
        loop
        controls={!compact}
      />
    );
  }

  if (slide.type === "HTML") {
    const html = typeof content.html === "string" ? content.html : "";
    return (
      <iframe
        title="HTML slide preview"
        className="h-full min-h-40 w-full border-0 bg-white"
        sandbox=""
        srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"></head><body>${html}</body></html>`}
      />
    );
  }

  return (
    <div
      className="flex h-full min-h-40 w-full items-center justify-center p-6 text-center"
      style={{ backgroundColor: background, color }}
    >
      <p
        className={
          compact
            ? "line-clamp-4 text-sm font-semibold"
            : "max-w-5xl text-4xl font-semibold"
        }
      >
        {text || "Digite o texto deste slide"}
      </p>
    </div>
  );
}
