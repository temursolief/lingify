-- XP rollup: one row per student per day, so pages read a few hundred small rows instead of every review and
-- answer the student ever made. Every existing student starts marked for a full recount, done on their next page view.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "xpDirtyFrom" TIMESTAMP(3),
ADD COLUMN     "xpDirtySeq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "XpDay" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "first" INTEGER NOT NULL DEFAULT 0,
    "proofs" INTEGER NOT NULL DEFAULT 0,
    "cards" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "XpDay_pkey" PRIMARY KEY ("userId","day")
);

-- AddForeignKey
ALTER TABLE "XpDay" ADD CONSTRAINT "XpDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: recount everyone from the beginning on first read.
UPDATE "User" SET "xpDirtyFrom" = '1970-01-01 00:00:00' WHERE "role" = 'STUDENT';
