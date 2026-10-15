import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AssetsModule } from "./assets/assets.module";
import { AuthModule } from "./auth/auth.module";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { PresentationsModule } from "./presentations/presentations.module";
import { ScreensModule } from "./screens/screens.module";
import { SamplerModule } from "./sampler/sampler.module";
import { PermissionsGuard } from "./auth/permissions.guard";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { PrismaModule } from "./prisma/prisma.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { AuditModule } from "./audit/audit.module";
import { InitializationModule } from "./initialization/initialization.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AssetsModule,
    EventsModule,
    PresentationsModule,
    SamplerModule,
    ScreensModule,
    HealthModule,
    RealtimeModule,
    AuditModule,
    InitializationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
