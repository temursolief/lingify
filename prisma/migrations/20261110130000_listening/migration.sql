-- CreateTable
CREATE TABLE "ListeningLesson" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "vocabulary" JSONB NOT NULL DEFAULT '[]',
    "total" INTEGER NOT NULL,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListeningLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListeningAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstSubmittedAt" TIMESTAMP(3),
    "firstCorrect" INTEGER,
    "band" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3),
    "answers" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ListeningAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListeningLesson_slug_key" ON "ListeningLesson"("slug");

-- CreateIndex
CREATE INDEX "ListeningAttempt_userId_lessonId_idx" ON "ListeningAttempt"("userId", "lessonId");

-- AddForeignKey
ALTER TABLE "ListeningLesson" ADD CONSTRAINT "ListeningLesson_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListeningAttempt" ADD CONSTRAINT "ListeningAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListeningAttempt" ADD CONSTRAINT "ListeningAttempt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "ListeningLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

