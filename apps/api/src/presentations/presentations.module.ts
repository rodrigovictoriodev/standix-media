import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { PresentationsController } from "./presentations.controller";
import { PresentationsService } from "./presentations.service";

@Module({
  imports: [RealtimeModule],
  controllers: [PresentationsController],
  providers: [PresentationsService],
  exports: [PresentationsService],
})
export class PresentationsModule {}
