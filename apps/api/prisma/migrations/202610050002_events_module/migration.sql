-- AlterEnum
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'FINISHED';

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT DEFAULT '#2563FF',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventMember" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMember_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Event"
    ADD COLUMN "categoryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Category_teamId_slug_key"
    ON "Category"("teamId", "slug");

CREATE INDEX "Category_teamId_idx"
    ON "Category"("teamId");

CREATE UNIQUE INDEX "EventMember_eventId_userId_key"
    ON "EventMember"("eventId", "userId");

CREATE INDEX "EventMember_eventId_idx"
    ON "EventMember"("eventId");

CREATE INDEX "EventMember_userId_idx"
    ON "EventMember"("userId");

-- AddForeignKey
ALTER TABLE "Category"
    ADD CONSTRAINT "Category_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event"
    ADD CONSTRAINT "Event_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventMember"
    ADD CONSTRAINT "EventMember_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventMember"
    ADD CONSTRAINT "EventMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
