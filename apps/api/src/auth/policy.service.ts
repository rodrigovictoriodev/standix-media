import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { RoleName } from "./roles.decorator";

@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async hasPermission(
    userId: string,
    permission: string,
    teamId?: string | null,
  ): Promise<boolean> {
    const teamScope = teamId ? [{ teamId: null }, { teamId }] : [{ teamId: null }];
    const assignment = await this.prisma.userRole.findFirst({
      where: {
        userId,
        OR: teamScope,
        role: {
          permissions: {
            some: {
              permission: { key: permission },
            },
          },
        },
      },
      select: { id: true },
    });
    return Boolean(assignment);
  }

  async hasPermissions(
    userId: string,
    permissions: string[],
    teamId?: string | null,
  ): Promise<boolean> {
    if (!permissions.length) return true;
    const teamScope = teamId ? [{ teamId: null }, { teamId }] : [{ teamId: null }];
    const assignment = await this.prisma.userRole.findFirst({
      where: {
        userId,
        OR: teamScope,
        role: {
          permissions: {
            some: {
              permission: { key: { in: permissions } },
            },
          },
        },
      },
      select: { id: true },
    });
    return Boolean(assignment);
  }

  async hasRole(
    userId: string,
    roleNames: RoleName[],
    teamId?: string | null,
  ): Promise<boolean> {
    if (!roleNames.length) return true;
    const teamScope = teamId ? [{ teamId: null }, { teamId }] : [{ teamId: null }];
    const assignment = await this.prisma.userRole.findFirst({
      where: {
        userId,
        OR: teamScope,
        role: { name: { in: roleNames } },
      },
      select: { id: true },
    });
    return Boolean(assignment);
  }
}
