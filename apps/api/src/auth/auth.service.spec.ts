import * as argon2 from "argon2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const accessSecret = "12345678901234567890123456789012";
  const refreshSecret = "abcdefghijklmnopqrstuvwxzy123456";
  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === "JWT_ACCESS_SECRET") return accessSecret;
      if (key === "JWT_REFRESH_SECRET") return refreshSecret;
      return "fallback";
    }),
    get: vi.fn((key: string, defaultValue?: string) => {
      if (key === "JWT_ACCESS_TTL") return "15m";
      if (key === "JWT_REFRESH_TTL_DAYS") return "30";
      return defaultValue ?? "15m";
    }),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("logs in a valid user and records an audit event", async () => {
    const passwordHash = await argon2.hash("Secret@123");
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({
        id: "user-1",
        email: "ops@standix.io",
        name: "Operations",
        passwordHash,
        status: "ACTIVE",
      }) },
      refreshToken: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const jwt = {
      signAsync: vi.fn(async (payload: { type: string }) =>
        payload.type === "access" ? "access-token" : "refresh-token",
      ),
    };
    const audit = { record: vi.fn().mockResolvedValue({}) };
    const reset = {
      createForUser: vi.fn(),
      verify: vi.fn(),
      revoke: vi.fn(),
    };

    const service = new AuthService(
      prisma as any,
      jwt as any,
      audit as any,
      reset as any,
      config as any,
    );

    const result = await service.login("ops@standix.io", "Secret@123");

    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login",
        entityType: "User",
        userId: "user-1",
      }),
    );
  });

  it("rejects an invalid password before creating tokens", async () => {
    const passwordHash = await argon2.hash("Correct@123");
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({
        id: "user-2",
        email: "admin@standix.io",
        name: "Admin",
        passwordHash,
        status: "ACTIVE",
      }) },
      refreshToken: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const jwt = { signAsync: vi.fn() };
    const audit = { record: vi.fn() };
    const reset = { createForUser: vi.fn(), verify: vi.fn(), revoke: vi.fn() };

    const service = new AuthService(
      prisma as any,
      jwt as any,
      audit as any,
      reset as any,
      config as any,
    );

    await expect(service.login("admin@standix.io", "Wrong@123")).rejects.toThrow(
      "Invalid email or password",
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it("never exposes the reset token and answers identically for unknown e-mails", async () => {
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "user-3", status: "ACTIVE" })
          .mockResolvedValueOnce(null),
      },
    };
    const audit = { record: vi.fn().mockResolvedValue({}) };
    const reset = {
      createForUser: vi
        .fn()
        .mockResolvedValue({ token: "secret-reset-token", expiresAt: new Date() }),
      verify: vi.fn(),
      revoke: vi.fn(),
    };
    const service = new AuthService(
      prisma as any,
      { signAsync: vi.fn() } as any,
      audit as any,
      reset as any,
      config as any,
    );

    const known = await service.forgotPassword("ops@standix.io");
    const unknown = await service.forgotPassword("nobody@standix.io");

    expect(known).toEqual(unknown);
    expect(JSON.stringify(known)).not.toContain("secret-reset-token");
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain("secret");
    expect(reset.createForUser).toHaveBeenCalledTimes(1);
  });
});
