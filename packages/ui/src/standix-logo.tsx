import type { ImgHTMLAttributes } from "react";

type StandixLogoProps = {
  src?: string;
  alt?: string;
  className?: string;
  imageProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt">;
};

export function StandixLogo({
  src,
  alt = "Standix",
  className,
  imageProps,
}: StandixLogoProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ""}`.trim()}>
      {src ? (
        <img src={src} alt={alt} {...imageProps} />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-white"
        >
          S
        </span>
      )}
      <span className="text-lg font-semibold tracking-tight text-white">standix</span>
    </span>
  );
}
