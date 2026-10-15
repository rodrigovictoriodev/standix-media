import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MediaProcessingService } from "./media-processing.service";

describe("MediaProcessingService", () => {
  const service = new MediaProcessingService();

  it("reads real PNG dimensions and writes a bounded WebP thumbnail", async () => {
    const png = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: "#2563FF" },
    })
      .png()
      .toBuffer();

    const { metadata, thumbnail } = await service.process(png, "image/png");

    expect(metadata).toMatchObject({ width: 1920, height: 1080, resolution: "1920x1080" });
    const thumb = await sharp(thumbnail!).metadata();
    expect(thumb.format).toBe("webp");
    expect(thumb.width).toBe(480);
    expect(thumb.height).toBe(270);
  });

  it("does not enlarge small images", async () => {
    const png = await sharp({
      create: { width: 64, height: 32, channels: 4, background: "#00000000" },
    })
      .png()
      .toBuffer();

    const { thumbnail } = await service.process(png, "image/png");
    expect((await sharp(thumbnail!).metadata()).width).toBe(64);
  });

  it("keeps the upload usable when the content cannot be decoded", async () => {
    const result = await service.process(Buffer.from("not an image"), "image/png");
    expect(result).toEqual({
      metadata: expect.objectContaining({ width: null, height: null }),
      thumbnail: null,
    });
  });
});
