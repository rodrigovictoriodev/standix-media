import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuditService } from "./audit.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PasswordResetTokenService } from "./password-reset-token.service";
import { PermissionsGuard } from "./permissions.guard";
import { PolicyService } from "./policy.service";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuditService,
    PolicyService,
    PasswordResetTokenService,
    JwtAuthGuard,
    PermissionsGuard,
    RolesGuard,
  ],
  exports: [
    JwtModule,
    JwtAuthGuard,
    PermissionsGuard,
    RolesGuard,
    PolicyService,
    AuditService,
    PasswordResetTokenService,
  ],
})
export class AuthModule {}
