-- Lingify becomes IELTS passages + Anki flashcards. Graded-reading data is dropped; old activity rows and
-- assignments (which pointed at graded texts) cannot be carried over.
DELETE FROM "ActivityTime" WHERE "activity"::text NOT IN ('IELTS', 'REVIEW');
DELETE FROM "Assignment";

-- CreateEnum
CREATE TYPE "CardQueue" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');

-- CreateEnum
CREATE TYPE "ErrorTag" AS ENUM ('VOCAB', 'DISTRACTOR', 'LOGIC', 'CARELESS');

-- AlterEnum
BEGIN;
CREATE TYPE "Activity_new" AS ENUM ('IELTS', 'REVIEW');
ALTER TABLE "ActivityTime" ALTER COLUMN "activity" TYPE "Activity_new" USING ("activity"::text::"Activity_new");
ALTER TYPE "Activity" RENAME TO "Activity_old";
ALTER TYPE "Activity_new" RENAME TO "Activity";
DROP TYPE "public"."Activity_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_textId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_userId_fkey";

-- DropForeignKey
ALTER TABLE "ExerciseAttempt" DROP CONSTRAINT "ExerciseAttempt_userId_fkey";

-- DropForeignKey
ALTER TABLE "FluencyRun" DROP CONSTRAINT "FluencyRun_textId_fkey";

-- DropForeignKey
ALTER TABLE "FluencyRun" DROP CONSTRAINT "FluencyRun_userId_fkey";

-- DropForeignKey
ALTER TABLE "Goal" DROP CONSTRAINT "Goal_userId_fkey";

-- DropForeignKey
ALTER TABLE "IeltsAttempt" DROP CONSTRAINT "IeltsAttempt_textId_fkey";

-- DropForeignKey
ALTER TABLE "IeltsAttempt" DROP CONSTRAINT "IeltsAttempt_userId_fkey";

-- DropForeignKey
ALTER TABLE "LemmaState" DROP CONSTRAINT "LemmaState_userId_fkey";

-- DropForeignKey
ALTER TABLE "PlacementTest" DROP CONSTRAINT "PlacementTest_userId_fkey";

-- DropForeignKey
ALTER TABLE "ReadingSession" DROP CONSTRAINT "ReadingSession_textId_fkey";

-- DropForeignKey
ALTER TABLE "ReadingSession" DROP CONSTRAINT "ReadingSession_userId_fkey";

-- DropForeignKey
ALTER TABLE "Text" DROP CONSTRAINT "Text_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "TextRating" DROP CONSTRAINT "TextRating_textId_fkey";

-- DropForeignKey
ALTER TABLE "TextRating" DROP CONSTRAINT "TextRating_userId_fkey";

-- DropForeignKey
ALTER TABLE "VocabSnapshot" DROP CONSTRAINT "VocabSnapshot_userId_fkey";

-- AlterTable
ALTER TABLE "Assignment" DROP COLUMN "goalType",
DROP COLUMN "kind",
DROP COLUMN "target",
DROP COLUMN "textId",
ADD COLUMN     "passageId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Class" DROP COLUMN "dailyMinutes";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "estimatedVocab",
DROP COLUMN "placementDone",
DROP COLUMN "topicPrefs";

-- DropTable
DROP TABLE "Event";

-- DropTable
DROP TABLE "ExerciseAttempt";

-- DropTable
DROP TABLE "FluencyRun";

-- DropTable
DROP TABLE "Goal";

-- DropTable
DROP TABLE "IeltsAttempt";

-- DropTable
DROP TABLE "LemmaState";

-- DropTable
DROP TABLE "PlacementTest";

-- DropTable
DROP TABLE "ReadingSession";

-- DropTable
DROP TABLE "Text";

-- DropTable
DROP TABLE "TextRating";

-- DropTable
DROP TABLE "VocabSnapshot";

-- DropEnum
DROP TYPE "AbandonReason";

-- DropEnum
DROP TYPE "AssignmentKind";

-- DropEnum
DROP TYPE "AttemptKind";

-- DropEnum
DROP TYPE "GoalType";

-- DropEnum
DROP TYPE "WordSource";

-- DropEnum
DROP TYPE "WordStatus";

-- CreateTable
CREATE TABLE "Passage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "paragraphs" TEXT[],
    "groups" JSONB NOT NULL,
    "timeLimit" INTEGER NOT NULL DEFAULT 20,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Passage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassageAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstSubmittedAt" TIMESTAMP(3),
    "firstSeconds" INTEGER,
    "firstCorrect" INTEGER,
    "total" INTEGER NOT NULL,
    "band" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PassageAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAnswer" (
    "attemptId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "firstCorrect" BOOLEAN NOT NULL,
    "tries" INTEGER NOT NULL DEFAULT 1,
    "evidence" JSONB,
    "evidenceOk" BOOLEAN,
    "errorTag" "ErrorTag",
    "history" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "QuestionAnswer_pkey" PRIMARY KEY ("attemptId","number")
);

-- CreateTable
CREATE TABLE "Deck" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT,
    "css" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "noteType" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckMedia" (
    "deckId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "DeckMedia_pkey" PRIMARY KEY ("deckId","name")
);

-- CreateTable
CREATE TABLE "CardState" (
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "queue" "CardQueue" NOT NULL DEFAULT 'NEW',
    "due" TIMESTAMP(3) NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "ease" INTEGER NOT NULL DEFAULT 2500,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "step" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CardState_pkey" PRIMARY KEY ("userId","cardId")
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "queue" "CardQueue" NOT NULL,
    "interval" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChunkMeaning" (
    "key" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "uz" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChunkMeaning_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Passage_slug_key" ON "Passage"("slug");

-- CreateIndex
CREATE INDEX "PassageAttempt_userId_passageId_idx" ON "PassageAttempt"("userId", "passageId");

-- CreateIndex
CREATE INDEX "PassageAttempt_passageId_idx" ON "PassageAttempt"("passageId");

-- CreateIndex
CREATE INDEX "Card_deckId_position_idx" ON "Card"("deckId", "position");

-- CreateIndex
CREATE INDEX "CardState_userId_due_idx" ON "CardState"("userId", "due");

-- CreateIndex
CREATE INDEX "ReviewLog_userId_at_idx" ON "ReviewLog"("userId", "at");

-- AddForeignKey
ALTER TABLE "Passage" ADD CONSTRAINT "Passage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "Passage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassageAttempt" ADD CONSTRAINT "PassageAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassageAttempt" ADD CONSTRAINT "PassageAttempt_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "Passage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PassageAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckMedia" ADD CONSTRAINT "DeckMedia_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardState" ADD CONSTRAINT "CardState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardState" ADD CONSTRAINT "CardState_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

