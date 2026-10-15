import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PresentationsService } from "./presentations.service";

describe("PresentationsService", () => {
  it("rejects an empty presentation title", async () => {
    const service = new PresentationsService({} as any, {} as any);

    await expect(
      service.create("team-1", "user-1", { title: "   " }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires reorder requests to include every slide once", async () => {
    const prisma = {
      presentation: {
        findFirst: vi.fn().mockResolvedValue({ id: "presentation-1", teamId: "team-1" }),
      },
      slide: {
        findMany: vi.fn().mockResolvedValue([{ id: "slide-1" }, { id: "slide-2" }]),
      },
      $transaction: vi.fn(),
    };
    const service = new PresentationsService(prisma as any, {} as any);

    await expect(
      service.reorderSlides("team-1", "presentation-1", ["slide-1"]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("stores the requested order in a transaction and broadcasts the new presentation", async () => {
    const tx = { slide: { update: vi.fn().mockResolvedValue(undefined) } };
    const prisma = {
      presentation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "presentation-1",
          teamId: "team-1",
          slides: [],
        }),
      },
      slide: {
        findMany: vi.fn().mockResolvedValue([{ id: "slide-1" }, { id: "slide-2" }]),
      },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const realtime = { broadcastPresentation: vi.fn().mockResolvedValue(undefined) };
    const service = new PresentationsService(prisma as any, realtime as any);

    await service.reorderSlides("team-1", "presentation-1", ["slide-2", "slide-1"]);

    expect(tx.slide.update).toHaveBeenCalledTimes(4);
    expect(tx.slide.update).toHaveBeenNthCalledWith(1, {
      where: { id: "slide-2" },
      data: { orderIndex: -1 },
    });
    expect(tx.slide.update).toHaveBeenNthCalledWith(4, {
      where: { id: "slide-1" },
      data: { orderIndex: 1 },
    });
    expect(realtime.broadcastPresentation).toHaveBeenCalledWith("presentation-1");
  });
});
