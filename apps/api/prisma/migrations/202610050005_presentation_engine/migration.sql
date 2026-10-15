-- CreateEnum
CREATE TYPE "SlideType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'HTML');

-- AlterTable
ALTER TABLE "Presentation"
    ADD COLUMN "activeSlideId" TEXT,
    ADD COLUMN "sourceFormat" TEXT NOT NULL DEFAULT 'native',
    ADD COLUMN "sourceMetadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "Slide"
    ADD COLUMN "type" "SlideType" NOT NULL DEFAULT 'TEXT',
    ADD COLUMN "thumbnailUrl" TEXT;

-- AddForeignKey
ALTER TABLE "Presentation"
    ADD CONSTRAINT "Presentation_activeSlideId_fkey"
    FOREIGN KEY ("activeSlideId") REFERENCES "Slide"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
