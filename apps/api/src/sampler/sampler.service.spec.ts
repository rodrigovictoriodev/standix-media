import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { SamplerService } from "./sampler.service";

describe("SamplerService", () => {
  const config = new ConfigService({
    MINIO_ENDPOINT: "localhost",
    MINIO_PORT: "9000",
    MINIO_USE_SSL: "false",
    MINIO_ACCESS_KEY: "test",
    MINIO_SECRET_KEY: "test-secret",
  });

  it("rejects cue references to non-audio assets", async () => {
    const prisma = {
      asset: { findFirst: vi.fn().mockResolvedValue(null) },
      cueBank: { findFirst: vi.fn() },
      audioCue: { findFirst: vi.fn() },
    };
    const service = new SamplerService(prisma as any, config);

    await expect(
      service.createCue("team-1", { name: "Click", assetId: "image-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects duplicate hotkeys within the same team", async () => {
    const prisma = {
      asset: { findFirst: vi.fn().mockResolvedValue({ id: "audio-1" }) },
      cueBank: { findFirst: vi.fn() },
      audioCue: {
        findFirst: vi.fn().mockResolvedValue({ id: "cue-other" }),
        create: vi.fn(),
      },
    };
    const service = new SamplerService(prisma as any, config);

    await expect(
      service.createCue("team-1", {
        name: "Applause",
        assetId: "audio-1",
        hotkey: "a",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.audioCue.create).not.toHaveBeenCalled();
  });

  it("rejects volume values outside the audio range", async () => {
    const prisma = {
      asset: { findFirst: vi.fn().mockResolvedValue({ id: "audio-1" }) },
      cueBank: { findFirst: vi.fn() },
      audioCue: { findFirst: vi.fn(), create: vi.fn() },
    };
    const service = new SamplerService(prisma as any, config);

    await expect(
      service.createCue("team-1", {
        name: "Applause",
        assetId: "audio-1",
        volume: 1.5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.audioCue.create).not.toHaveBeenCalled();
  });
});
