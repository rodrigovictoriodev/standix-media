import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client as MinioClient } from "minio";
import { createPublicStorageClient } from "../assets/public-storage";

const SIGNED_URL_TTL_SECONDS = 15 * 60;

/** Single MinIO access point: internal client for I/O, public one for signed URLs. */
@Injectable()
export class StorageService {
  private readonly client: MinioClient;
  private readonly publicClient: MinioClient;
  readonly bucket: string;
  private bucketReady = false;

  constructor(config: ConfigService) {
    this.client = new MinioClient({
      endPoint: config.get<string>("MINIO_ENDPOINT") ?? "localhost",
      port: Number(config.get<string>("MINIO_PORT") ?? "9000"),
      useSSL: config.get<string>("MINIO_USE_SSL") === "true",
      accessKey: config.getOrThrow<string>("MINIO_ACCESS_KEY"),
      secretKey: config.getOrThrow<string>("MINIO_SECRET_KEY"),
    });
    this.publicClient = createPublicStorageClient(config, this.client);
    this.bucket = config.get<string>("MINIO_BUCKET") ?? "standix-media";
  }

  async putObject(key: string, data: Buffer, contentType: string) {
    await this.ensureBucket();
    await this.client.putObject(this.bucket, key, data, data.length, {
      "Content-Type": contentType,
    });
  }

  async getObject(bucket: string, key: string) {
    const stream = await this.client.getObject(bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  async removeObject(bucket: string, key: string) {
    await this.client.removeObject(bucket, key);
  }

  async signedUrl(
    bucket: string,
    key: string,
    options: { contentType?: string; downloadName?: string } = {},
  ) {
    const headers: Record<string, string> = {};
    if (options.contentType) {
      headers["response-content-type"] = options.contentType;
    }
    if (options.downloadName) {
      headers["response-content-disposition"] = contentDisposition(
        options.downloadName,
      );
    }
    return this.publicClient.presignedGetObject(
      bucket,
      key,
      SIGNED_URL_TTL_SECONDS,
      headers,
    );
  }

  get signedUrlTtlSeconds() {
    return SIGNED_URL_TTL_SECONDS;
  }

  private async ensureBucket() {
    if (this.bucketReady) return;
    const exists = await this.client
      .bucketExists(this.bucket)
      .catch(() => false);
    if (!exists) await this.client.makeBucket(this.bucket, "us-east-1");
    this.bucketReady = true;
  }
}

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
