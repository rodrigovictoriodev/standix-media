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
import { SamplerService } from "./sampler.service";

@Controller("sampler")
export class SamplerController {
  constructor(private readonly sampler: SamplerService) {}

  @Get("banks")
  @Permissions("sampler:read")
  listBanks(@Headers("x-team-id") teamId?: string) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.sampler.listBanks(teamId);
  }

  @Post("banks")
  @Permissions("sampler:operate")
  createBank(
    @Headers("x-team-id") teamId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.sampler.createBank(teamId, {
      name: typeof body.name === "string" ? body.name : "",
      category: typeof body.category === "string" ? body.category : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
    });
  }

  @Patch("banks/:bankId")
  @Permissions("sampler:operate")
  updateBank(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("bankId") bankId: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.sampler.updateBank(teamId, bankId, {
      name: typeof body.name === "string" ? body.name : undefined,
      category:
        body.category === null || typeof body.category === "string"
          ? body.category
          : undefined,
      color:
        body.color === null || typeof body.color === "string"
          ? body.color
          : undefined,
      sortOrder:
        typeof body.sortOrder === "number" ? body.sortOrder : undefined,
    });
  }

  @Delete("banks/:bankId")
  @Permissions("sampler:operate")
  deleteBank(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("bankId") bankId: string,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.sampler.deleteBank(teamId, bankId);
  }

  @Get("cues")
  @Permissions("sampler:read")
  listCues(
    @Headers("x-team-id") teamId: string | undefined,
    @Query("bankId") bankId?: string,
    @Query("category") category?: string,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.sampler.listCues(teamId, bankId, category);
  }

  @Post("cues")
  @Permissions("sampler:operate")
  createCue(
    @Headers("x-team-id") teamId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.sampler.createCue(teamId, {
      name: typeof body.name === "string" ? body.name : "",
      assetId: typeof body.assetId === "string" ? body.assetId : "",
      bankId: typeof body.bankId === "string" ? body.bankId : null,
      eventId: typeof body.eventId === "string" ? body.eventId : null,
      category: typeof body.category === "string" ? body.category : null,
      hotkey: typeof body.hotkey === "string" ? body.hotkey : null,
      loop: typeof body.loop === "boolean" ? body.loop : undefined,
      volume: typeof body.volume === "number" ? body.volume : undefined,
    });
  }

  @Patch("cues/:cueId")
  @Permissions("sampler:operate")
  updateCue(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("cueId") cueId: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.sampler.updateCue(teamId, cueId, {
      name: typeof body.name === "string" ? body.name : undefined,
      assetId: typeof body.assetId === "string" ? body.assetId : undefined,
      bankId:
        body.bankId === null || typeof body.bankId === "string"
          ? body.bankId
          : undefined,
      category:
        body.category === null || typeof body.category === "string"
          ? body.category
          : undefined,
      hotkey:
        body.hotkey === null || typeof body.hotkey === "string"
          ? body.hotkey
          : undefined,
      loop: typeof body.loop === "boolean" ? body.loop : undefined,
      volume: typeof body.volume === "number" ? body.volume : undefined,
    });
  }

  @Delete("cues/:cueId")
  @Permissions("sampler:operate")
  deleteCue(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("cueId") cueId: string,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.sampler.deleteCue(teamId, cueId);
  }

  @Post("cues/:cueId/play")
  @Permissions("sampler:operate")
  playCue(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("cueId") cueId: string,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.sampler.getCueForPlayback(teamId, cueId);
  }
}
