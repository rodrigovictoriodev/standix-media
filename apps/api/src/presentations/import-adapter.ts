import type { SlideType } from "@prisma/client";

export type ImportedSlide = {
  type: SlideType;
  content: Record<string, unknown>;
  layout?: Record<string, unknown>;
  durationMs?: number;
};

export type ImportedPresentation = {
  title: string;
  slides: ImportedSlide[];
  sourceFormat: string;
  sourceMetadata?: Record<string, unknown>;
};

export interface PresentationImportAdapter {
  readonly format: string;
  canImport(filename: string): boolean;
  convert(file: Buffer): Promise<ImportedPresentation>;
}
