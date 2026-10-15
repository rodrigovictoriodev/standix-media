import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { Prisma, type Team, type Workspace } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

function createSlug(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "standix"
  );
}

@Injectable()
export class InitializationService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userId: string) {
    const [teamCount, memberships] = await Promise.all([
      this.prisma.team.count(),
      this.prisma.teamMembership.findMany({
        where: { userId },
        select: { team: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return {
      needsSetup: teamCount === 0,
      teams: memberships.map(({ team }) => team),
    };
  }

  async createWorkspaceAndTeam(
    userId: string,
    organizationName: unknown,
    teamName: unknown,
  ) {
    if (
      typeof organizationName !== "string" ||
      typeof teamName !== "string" ||
      !organizationName.trim() ||
      !teamName.trim()
    ) {
      throw new BadRequestException(
        "Organization and team names are required",
      );
    }

    const normalizedOrganizationName = organizationName.trim();
    const normalizedTeamName = teamName.trim();

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if ((await tx.team.count()) > 0) {
            throw new ConflictException("Platform setup is already complete");
          }

          const globalAdmin = await tx.userRole.findFirst({
            where: {
              userId,
              teamId: null,
              role: { name: "Admin" },
            },
            select: { id: true },
          });
          if (!globalAdmin) {
            throw new ForbiddenException(
              "Only a global administrator can initialize the platform",
            );
          }

          const adminRole = await tx.role.findUnique({
            where: { name: "Admin" },
            select: { id: true },
          });
          if (!adminRole) {
            throw new InternalServerErrorException(
              "The Admin role is not configured",
            );
          }

          const workspace = await tx.workspace.create({
            data: {
              name: normalizedOrganizationName,
              slug: createSlug(normalizedOrganizationName),
            },
          });
          const team = await tx.team.create({
            data: {
              name: normalizedTeamName,
              slug: createSlug(normalizedTeamName),
              workspaceId: workspace.id,
            },
          });
          await tx.teamMembership.create({
            data: { userId, teamId: team.id },
          });
          await tx.userRole.create({
            data: { userId, roleId: adminRole.id, teamId: team.id },
          });

          return {
            workspace: this.workspaceResponse(workspace),
            team: this.teamResponse(team),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      ) {
        throw new ConflictException("Platform setup is already complete");
      }
      throw error;
    }
  }

  async getDashboardSummary(userId: string, teamId: string | undefined) {
    if (!teamId) {
      throw new BadRequestException("The x-team-id header is required");
    }

    const membership = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { team: { select: { id: true, name: true } } },
    });
    if (!membership) {
      throw new ForbiddenException("You are not a member of this team");
    }

    const [userCount, assetCount, eventCount, presentationCount] =
      await Promise.all([
        this.prisma.teamMembership.count({
          where: { teamId, user: { status: "ACTIVE" } },
        }),
        this.prisma.asset.count({ where: { teamId, deletedAt: null } }),
        this.prisma.event.count({ where: { teamId } }),
        this.prisma.presentation.count({ where: { teamId } }),
      ]);

    return {
      team: membership.team,
      userCount,
      assetCount,
      eventCount,
      presentationCount,
    };
  }

  private workspaceResponse(workspace: Workspace) {
    return { id: workspace.id, name: workspace.name };
  }

  private teamResponse(team: Team) {
    return { id: team.id, name: team.name };
  }
}
