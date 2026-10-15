-- Derived thumbnail for each physical object (shared by deduplicated assets).
ALTER TABLE "MediaBlob" ADD COLUMN "thumbnailKey" TEXT;

-- A folder can only be removed once it is empty; never orphan subfolders.
ALTER TABLE "AssetFolder" DROP CONSTRAINT "AssetFolder_parentId_fkey";
ALTER TABLE "AssetFolder"
    ADD CONSTRAINT "AssetFolder_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "AssetFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "AssetFolder_parentId_idx" ON "AssetFolder"("parentId");

-- NULL parentId values are distinct for the composite unique key, so root
-- folder names need their own partial unique index.
CREATE UNIQUE INDEX "AssetFolder_teamId_root_name_key"
    ON "AssetFolder"("teamId", "name")
    WHERE "parentId" IS NULL;
