export type UserRoleName =
  | "Admin"
  | "Editor"
  | "Operator"
  | "AudioOperator"
  | "Viewer";

export type AssetKind = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
export type EventStatus = "DRAFT" | "SCHEDULED" | "LIVE" | "COMPLETED" | "ARCHIVED";

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}
