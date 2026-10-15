import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/jwt-auth.guard";
import { InitializationService } from "./initialization.service";

@Controller()
export class InitializationController {
  constructor(private readonly initialization: InitializationService) {}

  @Get("setup/status")
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.initialization.getStatus(user.id);
  }

  @Post("setup")
  createWorkspaceAndTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.initialization.createWorkspaceAndTeam(
      user.id,
      body.organizationName,
      body.teamName,
    );
  }

  @Get("dashboard/summary")
  getDashboardSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-team-id") teamId?: string,
  ) {
    return this.initialization.getDashboardSummary(user.id, teamId);
  }
}
