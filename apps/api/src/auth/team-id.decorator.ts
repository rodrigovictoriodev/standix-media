import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";

/** The team scope of the request, from the `x-team-id` header (required). */
export const TeamId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const header = ctx.switchToHttp().getRequest<Request>().headers["x-team-id"];
    if (typeof header !== "string" || !header) {
      throw new BadRequestException("The x-team-id header is required");
    }
    return header;
  },
);
