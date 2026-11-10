-- One deck of their own per student. Two requests arriving together could create two; merge any such pair into the
-- oldest deck (its cards move over), then let the database refuse a second one.
WITH ranked AS (
  SELECT "id", first_value("id") OVER (PARTITION BY "ownerId" ORDER BY "createdAt", "id") AS keep
  FROM "Deck"
  WHERE "ownerId" IS NOT NULL
)
UPDATE "Card" c SET "deckId" = r.keep FROM ranked r WHERE c."deckId" = r."id" AND r."id" <> r.keep;

WITH ranked AS (
  SELECT "id", first_value("id") OVER (PARTITION BY "ownerId" ORDER BY "createdAt", "id") AS keep
  FROM "Deck"
  WHERE "ownerId" IS NOT NULL
)
DELETE FROM "Deck" d USING ranked r WHERE d."id" = r."id" AND r."id" <> r.keep;

-- CreateIndex
CREATE UNIQUE INDEX "Deck_ownerId_key" ON "Deck"("ownerId");

-- Counts kept beside the content, so lists do not load whole passages and lessons to count their parts.
-- AlterTable
ALTER TABLE "ListeningLesson" ADD COLUMN     "wordCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Passage" ADD COLUMN     "paragraphCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "questionCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "ListeningLesson" SET "wordCount" = jsonb_array_length("vocabulary") WHERE jsonb_typeof("vocabulary") = 'array';

UPDATE "Passage" SET "paragraphCount" = COALESCE(array_length("paragraphs", 1), 0);

UPDATE "Passage" p
SET "questionCount" = COALESCE((
  SELECT SUM(jsonb_array_length(g -> 'questions'))
  FROM jsonb_array_elements(p."groups") g
  WHERE jsonb_typeof(g -> 'questions') = 'array'
), 0)
WHERE jsonb_typeof(p."groups") = 'array';

-- Indexes on the columns that joins and cascading deletes look rows up by.
-- CreateIndex
CREATE INDEX "Assignment_classId_idx" ON "Assignment"("classId");

-- CreateIndex
CREATE INDEX "Assignment_passageId_idx" ON "Assignment"("passageId");

-- CreateIndex
CREATE INDEX "AssignmentRecipient_studentId_idx" ON "AssignmentRecipient"("studentId");

-- CreateIndex
CREATE INDEX "CardState_cardId_idx" ON "CardState"("cardId");

-- CreateIndex
CREATE INDEX "Class_teacherId_idx" ON "Class"("teacherId");

-- CreateIndex
CREATE INDEX "Enrollment_classId_idx" ON "Enrollment"("classId");

-- CreateIndex
CREATE INDEX "ListeningAttempt_lessonId_idx" ON "ListeningAttempt"("lessonId");

-- CreateIndex
CREATE INDEX "ListeningLesson_ownerId_idx" ON "ListeningLesson"("ownerId");

-- CreateIndex
CREATE INDEX "Passage_ownerId_idx" ON "Passage"("ownerId");

-- CreateIndex
CREATE INDEX "ReviewLog_cardId_idx" ON "ReviewLog"("cardId");
