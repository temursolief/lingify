-- CreateEnum
CREATE TYPE "AbandonReason" AS ENUM ('TOO_HARD', 'NOT_INTERESTED', 'NO_TIME');

-- AlterEnum
ALTER TYPE "Activity" ADD VALUE 'FLUENCY';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttemptKind" ADD VALUE 'GIST';
ALTER TYPE "AttemptKind" ADD VALUE 'GUESS';
ALTER TYPE "AttemptKind" ADD VALUE 'CCQ';
ALTER TYPE "AttemptKind" ADD VALUE 'DISCOVERY';
ALTER TYPE "AttemptKind" ADD VALUE 'PHRASE';

-- AlterTable
ALTER TABLE "ExerciseAttempt" ADD COLUMN     "skill" TEXT;

-- AlterTable
ALTER TABLE "LemmaState" ADD COLUMN     "isPhrase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meaning" TEXT;

-- AlterTable
ALTER TABLE "ReadingSession" ADD COLUMN     "abandonReason" "AbandonReason",
ADD COLUMN     "abandonedAt" TIMESTAMP(3),
ADD COLUMN     "gistCorrect" BOOLEAN,
ADD COLUMN     "prediction" INTEGER;

-- AlterTable
ALTER TABLE "Text" ADD COLUMN     "gist" JSONB,
ADD COLUMN     "leadIn" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "phrases" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "preTeach" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "prediction" JSONB,
ADD COLUMN     "response" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "series" TEXT,
ADD COLUMN     "seriesPart" INTEGER;

-- CreateTable
CREATE TABLE "TextRating" (
    "userId" TEXT NOT NULL,
    "textId" TEXT NOT NULL,
    "enjoyment" INTEGER NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "recommend" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TextRating_pkey" PRIMARY KEY ("userId","textId")
);

-- CreateTable
CREATE TABLE "FluencyRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "textId" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "wpm" DOUBLE PRECISION NOT NULL,
    "gistCorrect" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FluencyRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FluencyRun_userId_createdAt_idx" ON "FluencyRun"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TextRating" ADD CONSTRAINT "TextRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextRating" ADD CONSTRAINT "TextRating_textId_fkey" FOREIGN KEY ("textId") REFERENCES "Text"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluencyRun" ADD CONSTRAINT "FluencyRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluencyRun" ADD CONSTRAINT "FluencyRun_textId_fkey" FOREIGN KEY ("textId") REFERENCES "Text"("id") ON DELETE CASCADE ON UPDATE CASCADE;
