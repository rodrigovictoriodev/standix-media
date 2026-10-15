import { Module } from "@nestjs/common";
import { MediaProcessingService } from "../media/media-processing.service";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, MediaProcessingService],
  exports: [AssetsService],
})
export class AssetsModule {}
