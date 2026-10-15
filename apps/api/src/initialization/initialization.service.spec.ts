import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { InitializationService } from "./initialization.service";

describe("InitializationService", () => {
  it("creates a workspace, team, membership, and team Admin role atomically", async () => {
    const workspace = {
      id: "workspace-1",
      name: "Organização Ágil",
      slug: "organizacao-agil",
    };
    const team = {
      id: "team-1",
      name: "Administradores",
      slug: "administradores",
    };
    const transaction = {
      team: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue(team),
      },
      userRole: {
        findFirst: vi.fn().mockResolvedValue({ id: "global-admin-role" }),
        create: vi.fn().mockResolvedValue({}),
      },
      role: { findUnique: vi.fn().mockResolvedValue({ id: "admin-role" }) },
      workspace: { create: vi.fn().mockResolvedValue(workspace) },
      teamMembership: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(
        (callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const service = new InitializationService(
      prisma as unknown as PrismaService,
    );

    const result = await service.createWorkspaceAndTeam(
      "user-1",
      " Organização Ágil ",
      " Administradores ",
    );

    expect(result).toEqual({
      workspace: { id: "workspace-1", name: "Organização Ágil" },
      team: { id: "team-1", name: "Administradores" },
    });
    expect(transaction.workspace.create).toHaveBeenCalledWith({
      data: { name: "Organização Ágil", slug: "organizacao-agil" },
    });
    expect(transaction.team.create).toHaveBeenCalledWith({
      data: {
        name: "Administradores",
        slug: "administradores",
        workspaceId: "workspace-1",
      },
    });
    expect(transaction.teamMembership.create).toHaveBeenCalledWith({
      data: { userId: "user-1", teamId: "team-1" },
    });
    expect(transaction.userRole.create).toHaveBeenCalledWith({
      data: { userId: "user-1", roleId: "admin-role", teamId: "team-1" },
    });
  });

  it("rejects setup after a team already exists", async () => {
    const transaction = {
      team: { count: vi.fn().mockResolvedValue(1) },
    };
    const prisma = {
      $transaction: vi.fn(
        (callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const service = new InitializationService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.createWorkspaceAndTeam("user-1", "Standix", "Administradores"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("only allows the global Admin to initialize the platform", async () => {
    const transaction = {
      team: { count: vi.fn().mockResolvedValue(0) },
      userRole: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: vi.fn(
        (callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const service = new InitializationService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.createWorkspaceAndTeam("user-1", "Standix", "Administradores"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns dashboard totals scoped to a team the user belongs to", async () => {
    const prisma = {
      teamMembership: {
        findUnique: vi.fn().mockResolvedValue({
          team: { id: "team-1", name: "Administradores" },
        }),
        count: vi.fn().mockResolvedValue(3),
      },
      asset: { count: vi.fn().mockResolvedValue(12) },
      event: { count: vi.fn().mockResolvedValue(4) },
      presentation: { count: vi.fn().mockResolvedValue(6) },
    };
    const service = new InitializationService(
      prisma as unknown as PrismaService,
    );

    const result = await service.getDashboardSummary("user-1", "team-1");

    expect(result).toEqual({
      team: { id: "team-1", name: "Administradores" },
      userCount: 3,
      assetCount: 12,
      eventCount: 4,
      presentationCount: 6,
    });
    expect(prisma.asset.count).toHaveBeenCalledWith({
      where: { teamId: "team-1", deletedAt: null },
    });
    expect(prisma.event.count).toHaveBeenCalledWith({
      where: { teamId: "team-1" },
    });
    expect(prisma.presentation.count).toHaveBeenCalledWith({
      where: { teamId: "team-1" },
    });
  });
});
