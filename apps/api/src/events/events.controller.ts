import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Permissions } from "../auth/permissions.decorator";
import { EventsService } from "./events.service";

@Controller("events")
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Permissions("events:read")
  list(
    @Headers("x-team-id") teamId: string | undefined,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("categoryId") categoryId?: string,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.events.listEvents(teamId, { status, search, categoryId });
  }

  @Get("calendar")
  @Permissions("events:read")
  calendar(
    @Headers("x-team-id") teamId: string | undefined,
    @Query("month") month?: string,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.events.getCalendar(teamId, month ?? new Date());
  }

  @Post()
  @Permissions("events:create")
  create(
    @Headers("x-team-id") teamId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    const startsAt =
      typeof body.startsAt === "string" || body.startsAt instanceof Date
        ? body.startsAt
        : undefined;
    const endsAt =
      typeof body.endsAt === "string" || body.endsAt instanceof Date
        ? body.endsAt
        : undefined;

    return this.events.createEvent(teamId, {
      name: String(body.name ?? ""),
      description: typeof body.description === "string" ? body.description : undefined,
      categoryId: typeof body.categoryId === "string" ? body.categoryId : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      startsAt,
      endsAt,
      timezone: typeof body.timezone === "string" ? body.timezone : undefined,
    });
  }

  @Get("categories")
  @Permissions("events:read")
  listCategories(@Headers("x-team-id") teamId: string | undefined) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.events.listCategories(teamId);
  }

  @Post("categories")
  @Permissions("events:create")
  createCategory(
    @Headers("x-team-id") teamId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.events.createCategory(teamId, {
      name: String(body.name ?? ""),
      description: typeof body.description === "string" ? body.description : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
    });
  }

  @Get(":id")
  @Permissions("events:read")
  getById(@Headers("x-team-id") teamId: string | undefined, @Param("id") id: string) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.events.getEvent(teamId, id);
  }

  @Patch(":id")
  @Permissions("events:update")
  update(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    const startsAt =
      body.startsAt === undefined || body.startsAt === null
        ? body.startsAt
        : typeof body.startsAt === "string" || body.startsAt instanceof Date
          ? body.startsAt
          : undefined;
    const endsAt =
      body.endsAt === undefined || body.endsAt === null
        ? body.endsAt
        : typeof body.endsAt === "string" || body.endsAt instanceof Date
          ? body.endsAt
          : undefined;

    return this.events.updateEvent(teamId, id, {
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      categoryId: typeof body.categoryId === "string" ? body.categoryId : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      startsAt,
      endsAt,
      timezone: typeof body.timezone === "string" ? body.timezone : undefined,
    });
  }

  @Post(":id/members")
  @Permissions("events:update")
  addMember(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    const userId = typeof body.userId === "string" ? body.userId : undefined;
    if (!userId) throw new BadRequestException("The userId is required");
    return this.events.addMember(teamId, id, userId, typeof body.role === "string" ? body.role : "Member");
  }

  @Get(":id/members")
  @Permissions("events:read")
  listMembers(@Headers("x-team-id") teamId: string | undefined, @Param("id") id: string) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.events.listMembers(teamId, id);
  }

  @Delete(":id")
  @Permissions("events:delete")
  delete(@Headers("x-team-id") teamId: string | undefined, @Param("id") id: string) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.events.deleteEvent(teamId, id);
  }
}
