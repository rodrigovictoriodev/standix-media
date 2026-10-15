import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticatedRequest } from "./jwt-auth.guard";
import { PolicyService } from "./policy.service";
import { ROLES_KEY, type RoleName } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policy: PolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length || context.getType() !== "http") return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException("Authentication required");
    }

    const teamId =
      (typeof request.headers["x-team-id"] === "string" && request.headers["x-team-id"]) ||
      request.params?.teamId ||
      (typeof request.body?.teamId === "string" ? request.body.teamId : undefined);

    const allowed = await this.policy.hasRole(request.user.id, roles, teamId);
    if (!allowed) throw new ForbiddenException("Role requirements not satisfied");
    return true;
  }
}
