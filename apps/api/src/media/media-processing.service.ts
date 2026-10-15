import { Injectable, Logger } from "@nestjs/common";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

export const THUMBNAIL_SIZE = 480;
export const THUMBNAIL_MIME = "image/webp";

export type TechnicalMetadata = {
  width: number | null;
  height: number | null;
  resolution: string | null;
  codec: string | null;
  durationSeconds: number | null;
};

export type ProcessedMedia = {
  metadata: TechnicalMetadata;
  thumbnail: Buffer | null;
};

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
};

/**
 * Extracts technical metadata and a WebP thumbnail from uploaded media.
 * Images go through sharp; video and audio through ffprobe/ffmpeg. Failures
 * never block the upload: the asset is stored without the derived data.
 */
@Injectable()
export class MediaProcessingService {
  private readonly logger = new Logger(MediaProcessingService.name);
  private readonly ffprobe = process.env.FFPROBE_PATH ?? "ffprobe";
  private readonly ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";

  async process(buffer: Buffer, mimeType: string): Promise<ProcessedMedia> {
    if (mimeType.startsWith("image/")) return this.processImage(buffer);
    if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) {
      return this.processTimedMedia(buffer, mimeType.startsWith("video/"));
    }
    return { metadata: emptyMetadata(), thumbnail: null };
  }

  private async processImage(buffer: Buffer): Promise<ProcessedMedia> {
    try {
      const image = sharp(buffer, { animated: false, failOn: "none" });
      const info = await image.metadata();
      // EXIF orientations 5-8 swap the displayed axes.
      const rotated = (info.orientation ?? 1) >= 5;
      const width = (rotated ? info.height : info.width) ?? null;
      const height = (rotated ? info.width : info.height) ?? null;
      const thumbnail = await this.toThumbnail(buffer);
      return {
        metadata: {
          ...emptyMetadata(),
          width,
          height,
          resolution: width && height ? `${width}x${height}` : null,
          codec: info.format ?? null,
        },
        thumbnail,
      };
    } catch (error) {
      this.logger.warn(`Image processing failed: ${String(error)}`);
      return { metadata: emptyMetadata(), thumbnail: null };
    }
  }

  private async processTimedMedia(
    buffer: Buffer,
    isVideo: boolean,
  ): Promise<ProcessedMedia> {
    const dir = await mkdtemp(join(tmpdir(), "standix-media-"));
    // Fixed name: the client-supplied filename never reaches the filesystem.
    const input = join(dir, "input");
    try {
      await writeFile(input, buffer);
      const metadata = await this.probe(input);
      const thumbnail = isVideo
        ? await this.extractFrame(input, metadata.durationSeconds)
        : null;
      return { metadata, thumbnail };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async probe(input: string): Promise<TechnicalMetadata> {
    try {
      const { stdout } = await execFileAsync(this.ffprobe, [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        input,
      ]);
      const probe = JSON.parse(stdout) as {
        streams?: ProbeStream[];
        format?: { duration?: string };
      };
      const video = probe.streams?.find((s) => s.codec_type === "video");
      const audio = probe.streams?.find((s) => s.codec_type === "audio");
      const duration = Number(
        probe.format?.duration ?? video?.duration ?? audio?.duration ?? 0,
      );
      const width = video?.width ?? null;
      const height = video?.height ?? null;
      return {
        width,
        height,
        resolution: width && height ? `${width}x${height}` : null,
        codec: video?.codec_name ?? audio?.codec_name ?? null,
        durationSeconds: duration > 0 ? duration : null,
      };
    } catch (error) {
      this.logger.warn(`ffprobe failed: ${String(error)}`);
      return emptyMetadata();
    }
  }

  private async extractFrame(input: string, duration: number | null) {
    const seek = duration && duration > 2 ? Math.min(1, duration / 2) : 0;
    try {
      const { stdout } = await execFileAsync(
        this.ffmpeg,
        [
          "-v",
          "error",
          "-ss",
          String(seek),
          "-i",
          input,
          "-frames:v",
          "1",
          "-f",
          "image2pipe",
          "-vcodec",
          "png",
          "-",
        ],
        { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
      );
      return stdout.length ? await this.toThumbnail(stdout) : null;
    } catch (error) {
      this.logger.warn(`ffmpeg frame extraction failed: ${String(error)}`);
      return null;
    }
  }

  private toThumbnail(buffer: Buffer) {
    return sharp(buffer, { animated: false, failOn: "none" })
      .rotate()
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  }
}

function emptyMetadata(): TechnicalMetadata {
  return {
    width: null,
    height: null,
    resolution: null,
    codec: null,
    durationSeconds: null,
  };
}
