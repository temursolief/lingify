-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER');

-- CreateEnum
CREATE TYPE "WordStatus" AS ENUM ('LEARNING', 'KNOWN');

-- CreateEnum
CREATE TYPE "WordSource" AS ENUM ('PLACEMENT', 'LOOKUP', 'REVIEW');

-- CreateEnum
CREATE TYPE "Activity" AS ENUM ('READING', 'QUIZ', 'VOCAB', 'GRAMMAR', 'REVIEW', 'PLACEMENT');

-- CreateEnum
CREATE TYPE "AttemptKind" AS ENUM ('COMPREHENSION', 'VOCAB', 'GRAMMAR', 'REVIEW');

-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('TEXT', 'GOAL');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('WORDS_WEEK', 'TEXTS_WEEK', 'MINUTES_WEEK');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "topicPrefs" TEXT[],
    "placementDone" BOOLEAN NOT NULL DEFAULT false,
    "estimatedVocab" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "userId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("userId","classId")
);

-- CreateTable
CREATE TABLE "Text" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "topics" TEXT[],
    "paragraphs" JSONB NOT NULL,
    "sentences" TEXT[],
    "lemmaCounts" JSONB NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "questions" JSONB NOT NULL,
    "grammar" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Text_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LemmaState" (
    "userId" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "status" "WordStatus" NOT NULL,
    "source" "WordSource" NOT NULL,
    "exposures" INTEGER NOT NULL DEFAULT 0,
    "lookups" INTEGER NOT NULL DEFAULT 0,
    "contextSentence" TEXT,
    "contextWord" TEXT,
    "contextTextId" TEXT,
    "srsInterval" INTEGER NOT NULL DEFAULT 0,
    "srsEase" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "srsDue" TIMESTAMP(3),
    "srsStreak" INTEGER NOT NULL DEFAULT 0,
    "srsReviews" INTEGER NOT NULL DEFAULT 0,
    "srsLapses" INTEGER NOT NULL DEFAULT 0,
    "knownAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LemmaState_pkey" PRIMARY KEY ("userId","lemma")
);

-- CreateTable
CREATE TABLE "ReadingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "textId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "wpm" DOUBLE PRECISION,
    "coverage" DOUBLE PRECISION NOT NULL,
    "lookupCount" INTEGER NOT NULL DEFAULT 0,
    "quizScore" DOUBLE PRECISION,

    CONSTRAINT "ReadingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "textId" TEXT,
    "kind" "AttemptKind" NOT NULL,
    "itemKey" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityTime" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "activity" "Activity" NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ActivityTime_pkey" PRIMARY KEY ("userId","day","activity")
);

-- CreateTable
CREATE TABLE "VocabSnapshot" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "knownCount" INTEGER NOT NULL,
    "learningCount" INTEGER NOT NULL,

    CONSTRAINT "VocabSnapshot_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "PlacementTest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "items" JSONB NOT NULL,
    "results" JSONB,
    "estimate" INTEGER,

    CONSTRAINT "PlacementTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "GoalType" NOT NULL,
    "target" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "kind" "AssignmentKind" NOT NULL,
    "textId" TEXT,
    "goalType" "GoalType",
    "target" INTEGER,
    "note" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentRecipient" (
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssignmentRecipient_pkey" PRIMARY KEY ("assignmentId","studentId")
);

-- CreateTable
CREATE TABLE "DictionaryEntry" (
    "word" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL,
    "data" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DictionaryEntry_pkey" PRIMARY KEY ("word")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "textId" TEXT,
    "data" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Class_joinCode_key" ON "Class"("joinCode");

-- CreateIndex
CREATE UNIQUE INDEX "Text_slug_key" ON "Text"("slug");

-- CreateIndex
CREATE INDEX "LemmaState_userId_status_srsDue_idx" ON "LemmaState"("userId", "status", "srsDue");

-- CreateIndex
CREATE INDEX "ReadingSession_userId_completedAt_idx" ON "ReadingSession"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "ExerciseAttempt_userId_kind_answeredAt_idx" ON "ExerciseAttempt"("userId", "kind", "answeredAt");

-- CreateIndex
CREATE INDEX "Event_userId_type_at_idx" ON "Event"("userId", "type", "at");

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LemmaState" ADD CONSTRAINT "LemmaState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingSession" ADD CONSTRAINT "ReadingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingSession" ADD CONSTRAINT "ReadingSession_textId_fkey" FOREIGN KEY ("textId") REFERENCES "Text"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAttempt" ADD CONSTRAINT "ExerciseAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTime" ADD CONSTRAINT "ActivityTime_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabSnapshot" ADD CONSTRAINT "VocabSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementTest" ADD CONSTRAINT "PlacementTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_textId_fkey" FOREIGN KEY ("textId") REFERENCES "Text"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRecipient" ADD CONSTRAINT "AssignmentRecipient_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRecipient" ADD CONSTRAINT "AssignmentRecipient_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
