-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "lessonId" TEXT,
ALTER COLUMN "passageId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Assignment_lessonId_idx" ON "Assignment"("lessonId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "ListeningLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
