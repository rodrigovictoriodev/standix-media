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
  Req,
} from "@nestjs/common";
import { SlideType } from "@prisma/client";
import { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { Permissions } from "../auth/permissions.decorator";
import { PresentationsService } from "./presentations.service";

@Controller("presentations")
export class PresentationsController {
  constructor(private readonly presentations: PresentationsService) {}

  @Get()
  @Permissions("presentations:read")
  list(@Headers("x-team-id") teamId?: string) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.presentations.list(teamId);
  }

  @Post()
  @Permissions("presentations:create")
  create(
    @Headers("x-team-id") teamId: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.presentations.create(teamId, request.user.id, {
      title: typeof body.title === "string" ? body.title : "",
      description: typeof body.description === "string" ? body.description : undefined,
      eventId: typeof body.eventId === "string" ? body.eventId : undefined,
    });
  }

  @Get(":id")
  @Permissions("presentations:read")
  get(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.presentations.get(teamId, id);
  }

  @Patch(":id")
  @Permissions("presentations:update")
  update(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.presentations.update(teamId, id, {
      title: typeof body.title === "string" ? body.title : undefined,
      description:
        body.description === null || typeof body.description === "string"
          ? body.description
          : undefined,
      eventId: body.eventId === null || typeof body.eventId === "string"
        ? body.eventId
        : undefined,
    });
  }

  @Post(":id/slides")
  @Permissions("presentations:update")
  createSlide(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.presentations.createSlide(teamId, id, {
      type: this.slideType(body.type),
      content: this.jsonObject(body.content),
      layout: this.jsonObject(body.layout),
      assetId: typeof body.assetId === "string" ? body.assetId : null,
      thumbnailUrl:
        body.thumbnailUrl === null || typeof body.thumbnailUrl === "string"
          ? body.thumbnailUrl
          : undefined,
      durationMs: typeof body.durationMs === "number" ? body.durationMs : undefined,
    });
  }

  @Patch(":id/slides/order")
  @Permissions("presentations:update")
  reorderSlides(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
    @Body("slideIds") slideIds: unknown,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    if (!Array.isArray(slideIds) || !slideIds.every((item) => typeof item === "string")) {
      throw new BadRequestException("slideIds must be an array of slide IDs");
    }
    return this.presentations.reorderSlides(teamId, id, slideIds);
  }

  @Patch(":id/slides/:slideId")
  @Permissions("presentations:update")
  updateSlide(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
    @Param("slideId") slideId: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.presentations.updateSlide(teamId, id, slideId, {
      type: this.slideType(body.type),
      content: this.jsonObject(body.content),
      layout: this.jsonObject(body.layout),
      assetId:
        body.assetId === null || typeof body.assetId === "string"
          ? body.assetId
          : undefined,
      thumbnailUrl:
        body.thumbnailUrl === null || typeof body.thumbnailUrl === "string"
          ? body.thumbnailUrl
          : undefined,
      durationMs:
        body.durationMs === null || typeof body.durationMs === "number"
          ? body.durationMs
          : undefined,
    });
  }

  @Delete(":id/slides/:slideId")
  @Permissions("presentations:update")
  deleteSlide(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
    @Param("slideId") slideId: string,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.presentations.removeSlide(teamId, id, slideId);
  }

  @Patch(":id/active-slide")
  @Permissions("presentations:operate")
  activateSlide(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
    @Body("slideId") slideId: string,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    if (!slideId) throw new BadRequestException("slideId is required");
    return this.presentations.activateSlide(teamId, id, slideId);
  }

  @Delete(":id")
  @Permissions("presentations:delete")
  delete(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
  ) {
    if (!teamId) throw new BadRequestException("The x-team-id header is required");
    return this.presentations.remove(teamId, id);
  }

  private slideType(value: unknown): SlideType | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !["TEXT", "IMAGE", "VIDEO", "HTML"].includes(value)) {
      throw new BadRequestException("type must be TEXT, IMAGE, VIDEO, or HTML");
    }
    return value as SlideType;
  }

  private jsonObject(value: unknown): Record<string, unknown> | undefined {
    if (value === undefined) return undefined;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException("Slide content and layout must be JSON objects");
    }
    return value as Record<string, unknown>;
  }
}
