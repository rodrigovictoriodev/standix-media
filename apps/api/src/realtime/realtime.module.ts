import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ScreensModule } from "../screens/screens.module";
import { RealtimeGateway } from "./realtime.gateway";

@Module({
  imports: [AuthModule, ScreensModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
