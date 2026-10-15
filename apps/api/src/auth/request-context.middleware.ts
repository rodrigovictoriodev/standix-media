import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export type StandixRequest = Request & {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  auditContext?: RequestContext;
};

export function requestContextMiddleware(
  req: StandixRequest,
  _res: Response,
  next: NextFunction,
) {
  const forwarded = req.headers["x-forwarded-for"];
  const ipAddress =
    typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : req.socket?.remoteAddress ?? req.ip;

  req.ipAddress = ipAddress;
  req.userAgent = req.headers["user-agent"] ?? "unknown";
  req.requestId = req.headers["x-request-id"]?.toString() ?? randomUUID();
  req.auditContext = {
    ipAddress,
    userAgent: req.userAgent,
    requestId: req.requestId,
  };
  next();
}
