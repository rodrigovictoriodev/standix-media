import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { EventsService } from "./events.service";

describe("EventsService", () => {
  it("creates an event with the configured status", async () => {
    const prisma = {
      category: { findFirst: vi.fn().mockResolvedValue({ id: "cat-1", teamId: "team-1" }) },
      event: { create: vi.fn().mockResolvedValue({ id: "evt-1", status: "SCHEDULED" }) },
    };

    const service = new EventsService(prisma as any);
    const result = await service.createEvent("team-1", {
      name: "Launch Night",
      status: "SCHEDULED",
    });

    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Launch Night",
          status: "SCHEDULED",
        }),
      }),
    );
    expect(result.status).toBe("SCHEDULED");
  });

  it("rejects invalid statuses", async () => {
    const prisma = {
      category: { findFirst: vi.fn() },
      event: { create: vi.fn() },
    };

    const service = new EventsService(prisma as any);

    await expect(
      service.createEvent("team-1", {
        name: "Bad status",
        status: "INVALID",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
