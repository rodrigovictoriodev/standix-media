ALTER TABLE "Asset"
ADD COLUMN "displayName" TEXT NOT NULL DEFAULT '';

UPDATE "Asset"
SET "displayName" = "filename"
WHERE "displayName" = '';
