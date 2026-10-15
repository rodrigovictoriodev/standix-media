-- AlterTable
ALTER TABLE "Asset"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Asset_teamId_deletedAt_idx"
  ON "Asset"("teamId", "deletedAt");

CREATE INDEX "Asset_teamId_isFavorite_idx"
  ON "Asset"("teamId", "isFavorite");
