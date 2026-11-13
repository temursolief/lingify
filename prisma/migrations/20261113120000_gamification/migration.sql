-- Gamification: the student's target band (end of the band path) and a per-class switch for the weekly league.
ALTER TABLE "User" ADD COLUMN "targetBand" DOUBLE PRECISION NOT NULL DEFAULT 7;
ALTER TABLE "Class" ADD COLUMN "leagueEnabled" BOOLEAN NOT NULL DEFAULT true;
