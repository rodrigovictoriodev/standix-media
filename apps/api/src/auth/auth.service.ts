import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "./audit.service";
import { MIN_PASSWORD_LENGTH } from "./auth.constants";
import { PasswordResetTokenService } from "./password-reset-token.service";

export type TokenPayload = {
  sub: string;
  email: string;
  type: "access" | "refresh";
  jti?: string;
};

export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: number;
  private readonly refreshTtlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly passwordResetTokens: PasswordResetTokenService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>("JWT_ACCESS_SECRET");
    this.refreshSecret = config.getOrThrow<string>("JWT_REFRESH_SECRET");
    if (
      this.accessSecret.length < 32 ||
      this.refreshSecret.length < 32 ||
      this.accessSecret === this.refreshSecret ||
      this.accessSecret.includes("replace-with-") ||
      this.refreshSecret.includes("replace-with-")
    ) {
      throw new Error(
        "JWT access and refresh secrets must be distinct random values of at least 32 characters",
      );
    }

    this.accessTtl = this.parseDuration(
      config.get<string>("JWT_ACCESS_TTL") ?? "15m",
    );
    this.refreshTtlDays = Number(
      config.get<string>("JWT_REFRESH_TTL_DAYS") ?? "30",
    );
    if (!Number.isInteger(this.refreshTtlDays) || this.refreshTtlDays < 1) {
      throw new Error("JWT_REFRESH_TTL_DAYS must be a positive integer");
    }
  }

  async login(email: string, password: string, context?: AuditContext) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !(await argon2.verify(user.passwordHash, password))
    ) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const tokens = await this.createTokens(user.id, user.email);
    await this.audit.record({
      userId: user.id,
      action: "auth.login",
      entityType: "User",
      entityId: user.id,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      metadata: { method: "login" },
    });
    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async refresh(refreshToken: string, context?: AuditContext) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { user: true },
    });

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt <= new Date() ||
      stored.userId !== payload.sub ||
      stored.user.status !== "ACTIVE"
    ) {
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }

    const nextTokens = await this.createTokenPair(stored.user.id, stored.user.email);
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: stored.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        throw new UnauthorizedException("Refresh token has already been used");
      }
      await tx.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: this.hashToken(nextTokens.refreshToken),
          expiresAt: new Date(Date.now() + this.refreshTtlDays * 86_400_000),
        },
      });
    });

    await this.audit.record({
      userId: stored.userId,
      action: "auth.refresh",
      entityType: "User",
      entityId: stored.userId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      metadata: { refreshTokenRotated: true },
    });
    return nextTokens;
  }

  async logout(refreshToken: string, context?: AuditContext) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const updated = await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashToken(refreshToken),
        userId: payload.sub,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }
    await this.audit.record({
      userId: payload.sub,
      action: "auth.logout",
      entityType: "User",
      entityId: payload.sub,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      metadata: { method: "logout" },
    });
    return { success: true };
  }

  async forgotPassword(email: string, context?: AuditContext) {
    const response = {
      success: true,
      message: "If an account exists, a reset email has been sent.",
    };
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") return response;

    // The token is only ever delivered out-of-band (e-mail). It must never be
    // part of the HTTP response or of the audit trail.
    await this.passwordResetTokens.createForUser(user.id);
    await this.audit.record({
      userId: user.id,
      action: "auth.forgot_password",
      entityType: "User",
      entityId: user.id,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      metadata: { resetTokenIssued: true },
    });
    return response;
  }

  async resetPassword(token: string, newPassword: string, context?: AuditContext) {
    if (!token || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException("A valid reset token and a strong password are required.");
    }

    const record = await this.passwordResetTokens.verify(token);
    if (!record) {
      throw new UnauthorizedException("Reset token is invalid or expired");
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.passwordResetTokens.revoke(token);
    await this.audit.record({
      userId: record.userId,
      action: "auth.reset_password",
      entityType: "User",
      entityId: record.userId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      metadata: { passwordReset: true },
    });
    return { success: true, message: "Password updated successfully." };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context?: AuditContext,
  ) {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `A new password with at least ${MIN_PASSWORD_LENGTH} characters is required.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Account is not active");
    }
    const validCurrent = await argon2.verify(user.passwordHash, currentPassword);
    if (!validCurrent) {
      throw new UnauthorizedException("Current password does not match");
    }

    const nextHash = await argon2.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: nextHash },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.record({
      userId,
      action: "auth.change_password",
      entityType: "User",
      entityId: userId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      metadata: { passwordChanged: true },
    });
    return { success: true, message: "Password updated successfully." };
  }

  private async createTokens(userId: string, email: string) {
    const tokens = await this.createTokenPair(userId, email);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlDays * 86_400_000),
      },
    });
    return tokens;
  }

  private async createTokenPair(userId: string, email: string) {
    const refreshPayload: TokenPayload = {
      sub: userId,
      email,
      type: "refresh",
      jti: randomUUID(),
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId, email, type: "access" } satisfies TokenPayload,
        { secret: this.accessSecret, expiresIn: this.accessTtl },
      ),
      this.jwt.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshTtlDays * 86_400,
      }),
    ]);
    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer" as const,
      expiresIn: `${this.accessTtl}s`,
    };
  }

  private async verifyRefreshToken(token: string) {
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    if (payload.type !== "refresh" || !payload.sub) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    return payload;
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private parseDuration(value: string) {
    const match = /^([1-9]\d*)(s|m|h|d)$/.exec(value);
    if (!match) {
      throw new Error("JWT_ACCESS_TTL must use a positive s, m, h, or d duration");
    }
    const amount = Number(match[1]);
    const multiplier = { s: 1, m: 60, h: 3_600, d: 86_400 }[
      match[2] as "s" | "m" | "h" | "d"
    ];
    return amount * multiplier;
  }
}
