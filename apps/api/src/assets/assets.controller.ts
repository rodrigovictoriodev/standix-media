import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { Permissions } from "../auth/permissions.decorator";
import { TeamId } from "../auth/team-id.decorator";
import {
  CreateFolderBody,
  ListAssetsQuery,
  SetAssetTagsBody,
  UpdateAssetBody,
  UpdateFolderBody,
  UploadAssetBody,
} from "./assets.dto";
import { AssetsService } from "./assets.service";

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

@Controller("assets")
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @Permissions("assets:read")
  list(@TeamId() teamId: string, @Query() query: ListAssetsQuery) {
    return this.assets.listAssets(teamId, query);
  }

  @Post("upload")
  @Permissions("assets:create")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  upload(
    @TeamId() teamId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest,
    @Body() body: UploadAssetBody,
  ) {
    if (!file) throw new BadRequestException("A file must be provided");
    return this.assets.create(teamId, request.user.id, file, {
      folderId: body.folderId,
      tags: body.tags?.split(",") ?? [],
    });
  }

  @Get("folders")
  @Permissions("assets:read")
  listFolders(@TeamId() teamId: string) {
    return this.assets.listFolders(teamId);
  }

  @Post("folders")
  @Permissions("assets:create")
  createFolder(@TeamId() teamId: string, @Body() body: CreateFolderBody) {
    return this.assets.createFolder(teamId, body.name, body.parentId);
  }

  @Patch("folders/:folderId")
  @Permissions("assets:update")
  updateFolder(
    @TeamId() teamId: string,
    @Param("folderId") folderId: string,
    @Body() body: UpdateFolderBody,
  ) {
    return this.assets.updateFolder(teamId, folderId, body);
  }

  @Delete("folders/:folderId")
  @Permissions("assets:update")
  deleteFolder(@TeamId() teamId: string, @Param("folderId") folderId: string) {
    return this.assets.deleteFolder(teamId, folderId);
  }

  @Get("tags")
  @Permissions("assets:read")
  listTags(@TeamId() teamId: string) {
    return this.assets.listTags(teamId);
  }

  @Get(":id")
  @Permissions("assets:read")
  getAsset(@TeamId() teamId: string, @Param("id") id: string) {
    return this.assets.getAsset(teamId, id);
  }

  @Get(":id/url")
  @Permissions("assets:read")
  getDownloadUrl(
    @TeamId() teamId: string,
    @Param("id") id: string,
    @Query("download") download?: string,
  ) {
    return this.assets.getDownloadUrl(teamId, id, download === "true");
  }

  @Get(":id/usage")
  @Permissions("assets:read")
  getAssetUsage(@TeamId() teamId: string, @Param("id") id: string) {
    return this.assets.getAssetReferences(teamId, id);
  }

  @Patch(":id")
  @Permissions("assets:update")
  updateAsset(
    @TeamId() teamId: string,
    @Param("id") id: string,
    @Body() body: UpdateAssetBody,
  ) {
    return this.assets.updateAsset(teamId, id, body);
  }

  @Put(":id/tags")
  @Permissions("assets:update")
  setTags(
    @TeamId() teamId: string,
    @Param("id") id: string,
    @Body() body: SetAssetTagsBody,
  ) {
    return this.assets.setTags(teamId, id, body.tags);
  }

  @Patch(":id/favorite")
  @Permissions("assets:update")
  toggleFavorite(@TeamId() teamId: string, @Param("id") id: string) {
    return this.assets.toggleFavorite(teamId, id);
  }

  @Patch(":id/trash")
  @Permissions("assets:update")
  trashAsset(@TeamId() teamId: string, @Param("id") id: string) {
    return this.assets.trashAsset(teamId, id);
  }

  @Patch(":id/restore")
  @Permissions("assets:update")
  restoreAsset(@TeamId() teamId: string, @Param("id") id: string) {
    return this.assets.restoreAsset(teamId, id);
  }

  @Delete(":id")
  @Permissions("assets:delete")
  deleteAsset(@TeamId() teamId: string, @Param("id") id: string) {
    return this.assets.deleteAsset(teamId, id);
  }
}
