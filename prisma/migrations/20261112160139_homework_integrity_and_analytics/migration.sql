-- CreateEnum
CREATE TYPE "ProctoringPolicy" AS ENUM ('NONE', 'WARN_ONCE', 'STRICT');

-- CreateEnum
CREATE TYPE "SubmissionReason" AS ENUM ('NORMAL', 'TIMER_EXPIRED', 'TAB_HIDDEN', 'WINDOW_BLUR', 'FULLSCREEN_EXIT');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "proctoringPolicy" "ProctoringPolicy" NOT NULL DEFAULT 'STRICT',
ADD COLUMN     "requireVocabFirst" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "AssignmentRecipient" ADD COLUMN     "firstSubmitAt" TIMESTAMP(3),
ADD COLUMN     "integrityFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vocabCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ListeningAttempt" ADD COLUMN     "integrityEvents" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "integrityFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "integrityReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "invalidatedAt" TIMESTAMP(3),
ADD COLUMN     "submissionReason" "SubmissionReason" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "telemetry" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "testStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ListeningLesson" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Passage" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PassageAttempt" ADD COLUMN     "integrityEvents" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "integrityFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "integrityReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "invalidatedAt" TIMESTAMP(3),
ADD COLUMN     "submissionReason" "SubmissionReason" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "telemetry" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "testStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ReviewLog" ADD COLUMN     "durationMs" INTEGER NOT NULL DEFAULT 0;

-- Homework given before this change keeps its old rule: done when the passage or lesson is done, with no vocabulary
-- requirement added after the fact. New assignments default to requiring it.
UPDATE "Assignment" SET "requireVocabFirst" = false;

-- First tries already submitted count as submitted for the homework they belong to.
UPDATE "AssignmentRecipient" r SET "firstSubmitAt" = sub.at
FROM (
  SELECT a."id" AS "assignmentId", pa."userId", min(pa."firstSubmittedAt") AS at
  FROM "Assignment" a JOIN "PassageAttempt" pa ON pa."passageId" = a."passageId"
  WHERE pa."firstSubmittedAt" IS NOT NULL
  GROUP BY a."id", pa."userId"
  UNION ALL
  SELECT a."id", la."userId", min(la."firstSubmittedAt")
  FROM "Assignment" a JOIN "ListeningAttempt" la ON la."lessonId" = a."lessonId"
  WHERE la."firstSubmittedAt" IS NOT NULL
  GROUP BY a."id", la."userId"
) sub
WHERE r."assignmentId" = sub."assignmentId" AND r."studentId" = sub."userId";

-- An assignment is for exactly one passage or one lesson (was only enforced in code).
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_one_content" CHECK (("passageId" IS NULL) <> ("lessonId" IS NULL));
