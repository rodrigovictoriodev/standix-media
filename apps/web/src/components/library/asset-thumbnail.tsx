"use client";

import { useState } from "react";
import { kindIcons, type Asset } from "./types";

/**
 * Card preview from the server-generated WebP thumbnail. Images whose shape is
 * close to the 4:3 frame fill it; very wide/tall ones (logos, banners) are
 * shown whole so nothing important is cropped.
 */
export function AssetThumbnail({
  asset,
  compact = false,
}: {
  asset: Asset;
  compact?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const { width, height } = asset.metadata;
  const ratio = width && height ? width / height : 4 / 3;
  const fill = asset.kind === "VIDEO" || (ratio >= 0.9 && ratio <= 1.9);

  if (!asset.thumbnailUrl || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 via-surface to-secondary/10">
        <span
          aria-hidden="true"
          className={`flex items-center justify-center rounded-2xl border border-white/10 bg-background/70 text-secondary shadow-lg ${
            compact ? "h-8 w-8 text-base" : "h-14 w-14 text-2xl"
          }`}
        >
          {kindIcons[asset.kind]}
        </span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#070b16]">
      {!loaded && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-surface via-white/5 to-surface"
        />
      )}
      <img
        src={asset.thumbnailUrl}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
          fill ? "object-cover" : compact ? "object-contain" : "object-contain p-3"
        } ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      {asset.kind === "VIDEO" && !compact && (
        <span
          aria-hidden="true"
          className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-sm text-white backdrop-blur"
        >
          ▶
        </span>
      )}
    </div>
  );
}
