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
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AssetKind } from "@prisma/client";
import { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { Permissions } from "../auth/permissions.decorator";
import { AssetsService } from "./assets.service";

@Controller("assets")
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @Permissions("assets:read")
  list(
    @Headers("x-team-id") teamId: string | undefined,
    @Query("folderId") folderId?: string,
    @Query("search") search?: string,
    @Query("favorite") favorite?: string,
    @Query("trashed") trashed?: string,
    @Query("kind") kind?: AssetKind,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.assets.listAssets(teamId, {
      folderId,
      search,
      favorite: favorite === "true",
      trashed: trashed === "true",
      kind,
    });
  }

  @Post("upload")
  @Permissions("assets:create")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Headers("x-team-id") teamId: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    if (!file) throw new BadRequestException("A file must be provided");
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");

    const folderId =
      typeof body.folderId === "string" ? body.folderId : undefined;
    const rawTags = body.tags;
    const tags = Array.isArray(rawTags)
      ? rawTags.filter((tag): tag is string => typeof tag === "string")
      : typeof rawTags === "string"
        ? rawTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];

    return this.assets.create(teamId, request.user.id, file, {
      folderId,
      tags,
    });
  }

  @Post("folders")
  @Permissions("assets:create")
  createFolder(
    @Headers("x-team-id") teamId: string | undefined,
    @Body("name") name: string,
    @Body("parentId") parentId?: string,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.assets.createFolder(teamId, name, parentId);
  }

  @Get("folders")
  @Permissions("assets:read")
  listFolders(
    @Headers("x-team-id") teamId: string | undefined,
    @Query("parentId") parentId?: string,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.assets.listFolders(teamId, parentId);
  }

  @Get(":id/url")
  @Permissions("assets:read")
  getDownloadUrl(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.assets.getDownloadUrl(teamId, id);
  }

  @Get(":id/usage")
  @Permissions("assets:read")
  getAssetUsage(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.assets.getAssetUsage(teamId, id);
  }

  @Patch(":id")
  @Permissions("assets:update")
  updateAsset(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.assets.updateAsset(teamId, id, {
      displayName:
        typeof body.displayName === "string" ? body.displayName : undefined,
      folderId:
        body.folderId === null || typeof body.folderId === "string"
          ? body.folderId
          : undefined,
    });
  }

  @Patch("/:id/favorite")
  @Permissions("assets:update")
  toggleFavorite(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.assets.toggleFavorite(teamId, id);
  }

  @Patch("/:id/trash")
  @Permissions("assets:update")
  trashAsset(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.assets.trashAsset(teamId, id);
  }

  @Patch("/:id/restore")
  @Permissions("assets:update")
  restoreAsset(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.assets.restoreAsset(teamId, id);
  }

  @Delete("/:id")
  @Permissions("assets:delete")
  deleteAsset(
    @Headers("x-team-id") teamId: string | undefined,
    @Param("id") id: string,
  ) {
    if (!teamId)
      throw new BadRequestException("The x-team-id header is required");
    return this.assets.deleteAsset(teamId, id);
  }
}
