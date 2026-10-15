import { ConfigService } from "@nestjs/config";
import { Client as MinioClient } from "minio";
import { describe, expect, it } from "vitest";
import { createPublicStorageClient } from "./public-storage";

const credentials = {
  MINIO_ACCESS_KEY: "test",
  MINIO_SECRET_KEY: "test-secret",
};

describe("createPublicStorageClient", () => {
  it("signs media URLs for the public origin", async () => {
    const storage = createPublicStorageClient(
      new ConfigService({
        ...credentials,
        MINIO_PUBLIC_URL: "https://media.example.test",
      }),
      new MinioClient({
        endPoint: "minio",
        port: 9000,
        accessKey: credentials.MINIO_ACCESS_KEY,
        secretKey: credentials.MINIO_SECRET_KEY,
      }),
    );

    const url = await storage.presignedGetObject(
      "standix-media",
      "sha256/ab/asset",
      900,
    );

    expect(new URL(url).origin).toBe("https://media.example.test");
    expect(new URL(url).pathname).toBe("/standix-media/sha256/ab/asset");
  });

  it("preserves a non-standard public port", async () => {
    const storage = createPublicStorageClient(
      new ConfigService({
        ...credentials,
        MINIO_PUBLIC_URL: "http://media.example.test:8081",
      }),
      new MinioClient({
        endPoint: "minio",
        port: 9000,
        accessKey: credentials.MINIO_ACCESS_KEY,
        secretKey: credentials.MINIO_SECRET_KEY,
      }),
    );

    const url = await storage.presignedGetObject(
      "standix-media",
      "sha256/ab/asset",
      900,
    );

    expect(new URL(url).origin).toBe("http://media.example.test:8081");
  });

  it("uses the internal client when no public origin is configured", () => {
    const fallback = new MinioClient({
      endPoint: "minio",
      port: 9000,
      accessKey: credentials.MINIO_ACCESS_KEY,
      secretKey: credentials.MINIO_SECRET_KEY,
    });

    expect(
      createPublicStorageClient(new ConfigService(credentials), fallback),
    ).toBe(fallback);
  });
});
