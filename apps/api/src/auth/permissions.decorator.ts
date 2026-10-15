import { SetMetadata } from "@nestjs/common";
import { PERMISSIONS_KEY } from "./auth.constants";

export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
