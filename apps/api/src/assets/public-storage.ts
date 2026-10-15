import { ConfigService } from "@nestjs/config";
import { Client as MinioClient } from "minio";

export function createPublicStorageClient(
  config: ConfigService,
  fallback: MinioClient,
) {
  const publicUrl = config.get<string>("MINIO_PUBLIC_URL");
  if (!publicUrl) return fallback;

  const url = new URL(publicUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "MINIO_PUBLIC_URL must be an HTTP(S) origin without a path",
    );
  }

  return new MinioClient({
    endPoint: url.hostname,
    ...(url.port ? { port: Number(url.port) } : {}),
    useSSL: url.protocol === "https:",
    region: "us-east-1",
    accessKey: config.getOrThrow<string>("MINIO_ACCESS_KEY"),
    secretKey: config.getOrThrow<string>("MINIO_SECRET_KEY"),
  });
}
