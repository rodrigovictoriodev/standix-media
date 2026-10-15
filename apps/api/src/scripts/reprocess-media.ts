import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { AssetsService } from "../assets/assets.service";

/** One-off backfill: `node dist/scripts/reprocess-media.js` inside the API container. */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    const result = await app.get(AssetsService).reprocessAllBlobs();
    console.log(
      `Reprocessed ${result.blobs} objects; ${result.thumbnails} thumbnails written.`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
