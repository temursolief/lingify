-- AlterTable
ALTER TABLE "ListeningAttempt" ADD COLUMN     "vocabSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "passageId" TEXT,
ADD COLUMN     "lessonId" TEXT;

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "ankiNoteId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deck_passageId_key" ON "Deck"("passageId");

-- CreateIndex
CREATE UNIQUE INDEX "Deck_lessonId_key" ON "Deck"("lessonId");

-- CreateIndex
CREATE INDEX "Card_ownerId_idx" ON "Card"("ownerId");

-- CreateIndex
CREATE INDEX "Card_deckId_ankiNoteId_idx" ON "Card"("deckId", "ankiNoteId");

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "Passage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "ListeningLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
