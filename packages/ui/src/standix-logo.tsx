import type { ImgHTMLAttributes } from "react";

export const STANDIX_LOGO_SRC = "/branding/logo-source.png";

type StandixLogoProps = {
  alt?: string;
  className?: string;
  imageProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt">;
};

export function StandixLogo({
  alt = "Standix",
  className,
  imageProps,
}: StandixLogoProps) {
  return (
    <span
      className={`inline-flex items-center gap-3 ${className ?? ""}`.trim()}
    >
      <img
        src={STANDIX_LOGO_SRC}
        alt={alt}
        className="h-9 w-9 object-contain"
        {...imageProps}
      />
      <span className="text-lg font-semibold tracking-tight text-white">
        standix
      </span>
    </span>
  );
}
