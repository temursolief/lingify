-- AlterEnum
ALTER TYPE "Activity" ADD VALUE 'IELTS';

-- AlterEnum
ALTER TYPE "WordSource" ADD VALUE 'READING';

-- AlterEnum
ALTER TYPE "WordStatus" ADD VALUE 'SEEN';

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "dailyMinutes" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "LemmaState" ADD COLUMN     "contexts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "encounters" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Text" ADD COLUMN     "ielts" JSONB,
ADD COLUMN     "level" TEXT NOT NULL DEFAULT 'B1',
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "timeLimit" INTEGER,
ADD COLUMN     "track" TEXT NOT NULL DEFAULT 'graded';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramCode" TEXT,
ADD COLUMN     "uzbekGlosses" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "IeltsAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "textId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "correct" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "byType" JSONB NOT NULL,
    "seconds" INTEGER NOT NULL,
    "band" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IeltsAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IeltsAttempt_userId_createdAt_idx" ON "IeltsAttempt"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramCode_key" ON "User"("telegramCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- AddForeignKey
ALTER TABLE "Text" ADD CONSTRAINT "Text_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsAttempt" ADD CONSTRAINT "IeltsAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsAttempt" ADD CONSTRAINT "IeltsAttempt_textId_fkey" FOREIGN KEY ("textId") REFERENCES "Text"("id") ON DELETE CASCADE ON UPDATE CASCADE;

