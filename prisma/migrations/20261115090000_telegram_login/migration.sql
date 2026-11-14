-- Telegram log-in for students and teacher approval of class requests.
-- Existing enrollments become APPROVED (the column default); existing accounts keep their email and password.
-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('PENDING', 'APPROVED');

-- CreateEnum
CREATE TYPE "LoginTokenStatus" AS ENUM ('WAITING', 'CONFIRMED', 'DENIED', 'USED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramStep" TEXT,
ADD COLUMN     "telegramUsername" TEXT,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "status" "EnrollmentStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateTable
CREATE TABLE "LoginToken" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "secretHash" TEXT,
    "status" "LoginTokenStatus" NOT NULL DEFAULT 'WAITING',
    "userId" TEXT,
    "note" TEXT,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginToken_code_key" ON "LoginToken"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LoginToken_secretHash_key" ON "LoginToken"("secretHash");

-- CreateIndex
CREATE INDEX "LoginToken_expiresAt_idx" ON "LoginToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "LoginToken" ADD CONSTRAINT "LoginToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

