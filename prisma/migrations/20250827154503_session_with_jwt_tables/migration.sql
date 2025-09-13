/*
  Warnings:

  - The primary key for the `RevokedRefreshToken` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `expiresAt` on the `RevokedRefreshToken` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `RevokedRefreshToken` table. All the data in the column will be lost.
  - The required column `id` was added to the `RevokedRefreshToken` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `sessionId` to the `RevokedRefreshToken` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "RevokedRefreshToken_expiresAt_idx";

-- DropIndex
DROP INDEX "RevokedRefreshToken_userId_idx";

-- AlterTable
ALTER TABLE "RevokedRefreshToken" DROP CONSTRAINT "RevokedRefreshToken_pkey",
DROP COLUMN "expiresAt",
DROP COLUMN "userId",
ADD COLUMN     "id" TEXT NOT NULL,
ADD COLUMN     "sessionId" TEXT NOT NULL,
ADD CONSTRAINT "RevokedRefreshToken_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "UserSession" ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpChallenge_channel_target_expiresAt_idx" ON "OtpChallenge"("channel", "target", "expiresAt");

-- CreateIndex
CREATE INDEX "RevokedRefreshToken_sessionId_idx" ON "RevokedRefreshToken"("sessionId");

-- CreateIndex
CREATE INDEX "RevokedRefreshToken_tokenHash_idx" ON "RevokedRefreshToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "RevokedRefreshToken" ADD CONSTRAINT "RevokedRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
