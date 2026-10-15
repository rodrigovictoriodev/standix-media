import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Permissions } from "../auth/permissions.decorator";
import { ScreensService, type ScreenKind } from "./screens.service";

const allowedScreens: ScreenKind[] = ["main", "stage", "live", "aux"];

@Controller("screens")
export class ScreensController {
  constructor(private readonly screens: ScreensService) {}

  @Get("groups")
  @Permissions("screens:read")
  listGroups() {
    return { groups: this.screens.listGroups() };
  }

  @Get("state")
  @Permissions("screens:read")
  getState(@Query("screen") screen?: string) {
    if (!screen || !allowedScreens.includes(screen as ScreenKind)) {
      throw new BadRequestException("A valid screen identifier is required");
    }
    return { screen, state: this.screens.getState(screen as ScreenKind) };
  }

  @Post("state")
  @Permissions("screens:operate")
  setState(@Body() body: Record<string, unknown>) {
    const screen = typeof body.screen === "string" ? body.screen : undefined;
    if (!screen || !allowedScreens.includes(screen as ScreenKind)) {
      throw new BadRequestException("A valid screen identifier is required");
    }

    return {
      screen,
      state: this.screens.setState(screen as ScreenKind, {
        title: typeof body.title === "string" ? body.title : undefined,
        subtitle: typeof body.subtitle === "string" ? body.subtitle : undefined,
        status: typeof body.status === "string" ? (body.status as any) : undefined,
        content: typeof body.content === "string" ? body.content : undefined,
        sceneId: typeof body.sceneId === "string" ? body.sceneId : undefined,
        confidence: typeof body.confidence === "number" ? body.confidence : undefined,
        metadata: typeof body.metadata === "object" && body.metadata ? (body.metadata as Record<string, unknown>) : undefined,
      } as any),
    };
  }

  @Get(":screen")
  @Permissions("screens:read")
  getScreen(@Param("screen") screen: string) {
    if (!allowedScreens.includes(screen as ScreenKind)) {
      throw new BadRequestException("A valid screen identifier is required");
    }
    return { screen, state: this.screens.getState(screen as ScreenKind) };
  }
}
