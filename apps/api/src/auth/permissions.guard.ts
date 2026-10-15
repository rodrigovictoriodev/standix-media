import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "./auth.constants";
import { AuthenticatedRequest } from "./jwt-auth.guard";
import { PolicyService } from "./policy.service";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policy: PolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length || context.getType() !== "http") return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException("Authentication required");
    }

    const headerTeamId = request.headers["x-team-id"];
    const teamId =
      (typeof headerTeamId === "string" && headerTeamId) ||
      request.params?.teamId ||
      (typeof request.body?.teamId === "string" ? request.body.teamId : undefined);

    const allowed = await this.policy.hasPermissions(
      request.user.id,
      required,
      teamId,
    );
    if (!allowed) {
      throw new ForbiddenException("Insufficient permissions for this operation");
    }
    return true;
  }
}
