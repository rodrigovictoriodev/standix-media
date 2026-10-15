-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "workspaceId" TEXT;

-- Preserve existing teams under a shared workspace.
INSERT INTO "Workspace" ("id", "name", "slug", "updatedAt")
SELECT 'legacy-workspace', 'Standix', 'standix', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Team");

UPDATE "Team"
SET "workspaceId" = 'legacy-workspace'
WHERE "workspaceId" IS NULL;

-- AlterTable
ALTER TABLE "Team" ALTER COLUMN "workspaceId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");
CREATE INDEX "Team_workspaceId_idx" ON "Team"("workspaceId");

-- AddForeignKey
ALTER TABLE "Team"
    ADD CONSTRAINT "Team_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
