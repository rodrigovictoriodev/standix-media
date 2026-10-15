-- CreateTable
CREATE TABLE "CueBank" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "color" TEXT DEFAULT '#2563FF',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CueBank_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AudioCue" ADD COLUMN "bankId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CueBank_teamId_name_key" ON "CueBank"("teamId", "name");
CREATE INDEX "CueBank_teamId_sortOrder_idx" ON "CueBank"("teamId", "sortOrder");
CREATE INDEX "AudioCue_bankId_idx" ON "AudioCue"("bankId");
CREATE UNIQUE INDEX "AudioCue_teamId_hotkey_key" ON "AudioCue"("teamId", "hotkey");

-- AddForeignKey
ALTER TABLE "CueBank"
    ADD CONSTRAINT "CueBank_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AudioCue"
    ADD CONSTRAINT "AudioCue_bankId_fkey"
    FOREIGN KEY ("bankId") REFERENCES "CueBank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
