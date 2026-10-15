import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AssetKind, Prisma, SlideType } from "@prisma/client";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { PrismaService } from "../prisma/prisma.service";

type SlideInput = {
  type?: SlideType;
  content?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  assetId?: string | null;
  thumbnailUrl?: string | null;
  durationMs?: number | null;
};

const slideTypes: SlideType[] = ["TEXT", "IMAGE", "VIDEO", "HTML"];

@Injectable()
export class PresentationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  list(teamId: string) {
    return this.prisma.presentation.findMany({
      where: { teamId },
      include: {
        activeSlide: true,
        slides: { orderBy: { orderIndex: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async get(teamId: string, id: string) {
    const presentation = await this.prisma.presentation.findFirst({
      where: { id, teamId },
      include: {
        activeSlide: true,
        slides: {
          orderBy: { orderIndex: "asc" },
          include: {
            asset: {
              select: { id: true, filename: true, kind: true, metadata: true },
            },
          },
        },
      },
    });

    if (!presentation) throw new NotFoundException("Presentation not found");
    return presentation;
  }

  async create(
    teamId: string,
    ownerId: string,
    input: { title: string; description?: string; eventId?: string },
  ) {
    const title = input.title.trim();
    if (!title) throw new BadRequestException("Presentation title is required");

    if (input.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: input.eventId, teamId },
        select: { id: true },
      });
      if (!event) throw new BadRequestException("Event not found for this team");
    }

    return this.prisma.presentation.create({
      data: {
        teamId,
        ownerId,
        eventId: input.eventId ?? null,
        title,
        description: input.description,
      },
      include: { slides: true },
    });
  }

  async update(
    teamId: string,
    id: string,
    input: { title?: string; description?: string | null; eventId?: string | null },
  ) {
    await this.get(teamId, id);
    if (input.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: input.eventId, teamId },
        select: { id: true },
      });
      if (!event) throw new BadRequestException("Event not found for this team");
    }

    const updated = await this.prisma.presentation.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
      },
      include: { activeSlide: true, slides: { orderBy: { orderIndex: "asc" } } },
    });
    await this.realtime.broadcastPresentation(id);
    return updated;
  }

  async remove(teamId: string, id: string) {
    await this.get(teamId, id);
    await this.prisma.presentation.delete({ where: { id } });
    return { id, deleted: true };
  }

  async createSlide(teamId: string, presentationId: string, input: SlideInput) {
    await this.get(teamId, presentationId);
    const type = this.validateSlideType(input.type ?? "TEXT");
    await this.validateAsset(teamId, type, input.assetId);

    const orderIndex = await this.prisma.slide.count({ where: { presentationId } });
    const slide = await this.prisma.$transaction(async (tx) => {
      const created = await tx.slide.create({
        data: {
          presentationId,
          orderIndex,
          type,
          assetId: input.assetId ?? null,
          thumbnailUrl: input.thumbnailUrl ?? null,
          content: (input.content ?? {}) as Prisma.InputJsonValue,
          layout: (input.layout ?? {}) as Prisma.InputJsonValue,
          durationMs: input.durationMs ?? null,
        },
      });

      await tx.presentation.updateMany({
        where: { id: presentationId, activeSlideId: null },
        data: { activeSlideId: created.id },
      });
      return created;
    });
    await this.realtime.broadcastPresentation(presentationId);
    return slide;
  }

  async updateSlide(
    teamId: string,
    presentationId: string,
    slideId: string,
    input: SlideInput,
  ) {
    const existing = await this.prisma.slide.findFirst({
      where: { id: slideId, presentationId, presentation: { teamId } },
      select: { id: true, type: true, assetId: true },
    });
    if (!existing) throw new NotFoundException("Slide not found");

    const type = this.validateSlideType(input.type ?? existing.type);
    const assetId = input.assetId === undefined ? existing.assetId : input.assetId;
    await this.validateAsset(teamId, type, assetId);

    const slide = await this.prisma.slide.update({
      where: { id: slideId },
      data: {
        ...(input.type !== undefined ? { type } : {}),
        ...(input.assetId !== undefined ? { assetId: input.assetId } : {}),
        ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
        ...(input.content !== undefined
          ? { content: input.content as Prisma.InputJsonValue }
          : {}),
        ...(input.layout !== undefined
          ? { layout: input.layout as Prisma.InputJsonValue }
          : {}),
        ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      },
    });
    await this.realtime.broadcastPresentation(presentationId);
    return slide;
  }

  async removeSlide(teamId: string, presentationId: string, slideId: string) {
    const existing = await this.prisma.slide.findFirst({
      where: { id: slideId, presentationId, presentation: { teamId } },
      select: { id: true, orderIndex: true },
    });
    if (!existing) throw new NotFoundException("Slide not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.slide.delete({ where: { id: slideId } });
      const remaining = await tx.slide.findMany({
        where: { presentationId },
        orderBy: { orderIndex: "asc" },
        select: { id: true },
      });
      for (let index = 0; index < remaining.length; index += 1) {
        await tx.slide.update({
          where: { id: remaining[index].id },
          data: { orderIndex: -(index + 1) },
        });
      }
      for (let index = 0; index < remaining.length; index += 1) {
        await tx.slide.update({
          where: { id: remaining[index].id },
          data: { orderIndex: index },
        });
      }

      const presentation = await tx.presentation.findUnique({
        where: { id: presentationId },
        select: { activeSlideId: true },
      });
      if (presentation?.activeSlideId === slideId) {
        await tx.presentation.update({
          where: { id: presentationId },
          data: { activeSlideId: remaining[0]?.id ?? null },
        });
      }
    });
    await this.realtime.broadcastPresentation(presentationId);
    return { id: slideId, deleted: true };
  }

  async reorderSlides(teamId: string, presentationId: string, slideIds: string[]) {
    await this.get(teamId, presentationId);
    if (!Array.isArray(slideIds) || new Set(slideIds).size !== slideIds.length) {
      throw new BadRequestException("Slide order must contain unique slide IDs");
    }

    const slides = await this.prisma.slide.findMany({
      where: { presentationId },
      select: { id: true },
    });
    const existingIds = new Set(slides.map(({ id }) => id));
    if (
      slideIds.length !== slides.length ||
      slideIds.some((slideId) => !existingIds.has(slideId))
    ) {
      throw new BadRequestException("Slide order must include every slide exactly once");
    }

    await this.prisma.$transaction(async (tx) => {
      for (let index = 0; index < slideIds.length; index += 1) {
        await tx.slide.update({
          where: { id: slideIds[index] },
          data: { orderIndex: -(index + 1) },
        });
      }
      for (let index = 0; index < slideIds.length; index += 1) {
        await tx.slide.update({
          where: { id: slideIds[index] },
          data: { orderIndex: index },
        });
      }
    });
    await this.realtime.broadcastPresentation(presentationId);
    return this.get(teamId, presentationId);
  }

  async activateSlide(teamId: string, presentationId: string, slideId: string) {
    const slide = await this.prisma.slide.findFirst({
      where: { id: slideId, presentationId, presentation: { teamId } },
      select: { id: true },
    });
    if (!slide) throw new NotFoundException("Slide not found in this presentation");

    await this.prisma.presentation.update({
      where: { id: presentationId },
      data: { activeSlideId: slide.id },
    });
    await this.realtime.broadcastPresentation(presentationId);
    return this.get(teamId, presentationId);
  }

  private validateSlideType(type: SlideType): SlideType {
    if (!slideTypes.includes(type)) {
      throw new BadRequestException("Slide type must be TEXT, IMAGE, VIDEO, or HTML");
    }
    return type;
  }

  private async validateAsset(teamId: string, type: SlideType, assetId?: string | null) {
    if (!assetId) return;

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, teamId, deletedAt: null },
      select: { kind: true },
    });
    if (!asset) throw new BadRequestException("Media asset not found for this team");

    const expectedKind: Partial<Record<SlideType, AssetKind>> = {
      IMAGE: "IMAGE",
      VIDEO: "VIDEO",
    };
    const expected = expectedKind[type];
    if (expected && asset.kind !== expected) {
      throw new BadRequestException(`${type} slides require a ${expected.toLowerCase()} asset`);
    }
  }
}
