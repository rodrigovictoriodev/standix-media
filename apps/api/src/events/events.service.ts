import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { EventStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const EVENT_STATUS_VALUES = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "FINISHED",
  "ARCHIVED",
] as const;

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async listEvents(teamId: string, filters: {
    status?: string;
    search?: string;
    categoryId?: string;
  } = {}) {
    const where: Prisma.EventWhereInput = {
      teamId,
      ...(filters.status ? { status: filters.status as any } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { description: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    return this.prisma.event.findMany({
      where,
      include: {
        categoryRef: true,
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        presentations: true,
        screens: true,
      },
      orderBy: { startsAt: "asc" },
    });
  }

  async getEvent(teamId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, teamId },
      include: {
        categoryRef: true,
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        presentations: { include: { slides: true } },
        screens: true,
      },
    });

    if (!event) {
      throw new NotFoundException("Event not found");
    }

    return event;
  }

  async createEvent(teamId: string, payload: {
    name: string;
    description?: string;
    categoryId?: string;
    status?: string;
    startsAt?: string | Date;
    endsAt?: string | Date;
    timezone?: string;
  }) {
    const name = payload.name?.trim();
    if (!name) {
      throw new BadRequestException("Event name is required");
    }

    if (payload.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: payload.categoryId, teamId },
      });
      if (!category) {
        throw new BadRequestException("Category not found for this team");
      }
    }

    const status = this.validateStatus(payload.status);
    const startsAt = payload.startsAt ? new Date(payload.startsAt) : null;
    const endsAt = payload.endsAt ? new Date(payload.endsAt) : null;

    if (startsAt && endsAt && endsAt < startsAt) {
      throw new BadRequestException("The event end date must be after the start date");
    }

    return this.prisma.event.create({
      data: {
        teamId,
        name,
        description: payload.description,
        categoryId: payload.categoryId || null,
        category: payload.categoryId ? undefined : undefined,
        status,
        startsAt,
        endsAt,
        timezone: payload.timezone ?? "UTC",
      },
      include: {
        categoryRef: true,
        members: true,
      },
    });
  }

  async updateEvent(teamId: string, eventId: string, payload: {
    name?: string;
    description?: string;
    categoryId?: string;
    status?: string;
    startsAt?: string | Date | null;
    endsAt?: string | Date | null;
    timezone?: string;
  }) {
    await this.ensureEventBelongsToTeam(teamId, eventId);

    if (payload.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: payload.categoryId, teamId },
      });
      if (!category) {
        throw new BadRequestException("Category not found for this team");
      }
    }

    const data: Prisma.EventUpdateInput = {
      ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.categoryId !== undefined ? { categoryId: payload.categoryId || null } : {}),
      ...(payload.status ? { status: this.validateStatus(payload.status) } : {}),
      ...(payload.startsAt !== undefined ? { startsAt: payload.startsAt ? new Date(payload.startsAt) : null } : {}),
      ...(payload.endsAt !== undefined ? { endsAt: payload.endsAt ? new Date(payload.endsAt) : null } : {}),
      ...(payload.timezone !== undefined ? { timezone: payload.timezone } : {}),
    };

    return this.prisma.event.update({
      where: { id: eventId },
      data,
      include: { categoryRef: true, members: true },
    });
  }

  async deleteEvent(teamId: string, eventId: string) {
    await this.ensureEventBelongsToTeam(teamId, eventId);
    await this.prisma.event.delete({ where: { id: eventId } });
    return { id: eventId, deleted: true };
  }

  async listCategories(teamId: string) {
    return this.prisma.category.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
      include: { events: true },
    });
  }

  async createCategory(teamId: string, payload: { name: string; description?: string; color?: string }) {
    const name = payload.name?.trim();
    if (!name) {
      throw new BadRequestException("Category name is required");
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    return this.prisma.category.create({
      data: {
        teamId,
        name,
        slug,
        description: payload.description,
        color: payload.color ?? "#2563FF",
      },
    });
  }

  async addMember(teamId: string, eventId: string, userId: string, role: string = "Member") {
    await this.ensureEventBelongsToTeam(teamId, eventId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.eventMember.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: { role },
      create: { eventId, userId, role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async listMembers(teamId: string, eventId: string) {
    await this.ensureEventBelongsToTeam(teamId, eventId);
    return this.prisma.eventMember.findMany({
      where: { eventId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async getCalendar(teamId: string, month: string | Date) {
    const seed = new Date(month);
    const start = new Date(seed.getFullYear(), seed.getMonth(), 1);
    const end = new Date(seed.getFullYear(), seed.getMonth() + 1, 0, 23, 59, 59, 999);

    const events = await this.prisma.event.findMany({
      where: {
        teamId,
        OR: [
          { startsAt: { gte: start, lte: end } },
          { endsAt: { gte: start, lte: end } },
        ],
      },
      include: { categoryRef: true },
      orderBy: { startsAt: "asc" },
    });

    return { month: start.toISOString(), events };
  }

  private validateStatus(status?: string): EventStatus {
    const normalized = (status ?? "DRAFT").toUpperCase();
    if (!EVENT_STATUS_VALUES.includes(normalized as any)) {
      throw new BadRequestException(
        `Invalid event status. Allowed values: ${EVENT_STATUS_VALUES.join(", ")}`,
      );
    }
    return normalized as EventStatus;
  }

  private async ensureEventBelongsToTeam(teamId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, teamId },
      select: { id: true },
    });

    if (!event) {
      throw new NotFoundException("Event not found");
    }
  }
}
