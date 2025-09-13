/*
  Warnings:

  - The primary key for the `RevokedRefreshToken` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `token` on the `RevokedRefreshToken` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `UserSession` table. All the data in the column will be lost.
  - Added the required column `tokenHash` to the `RevokedRefreshToken` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RevokedRefreshToken" DROP CONSTRAINT "RevokedRefreshToken_pkey",
DROP COLUMN "token",
ADD COLUMN     "tokenHash" TEXT NOT NULL,
ADD CONSTRAINT "RevokedRefreshToken_pkey" PRIMARY KEY ("tokenHash");

-- AlterTable
ALTER TABLE "UserSession" DROP COLUMN "refreshToken",
ADD COLUMN     "refreshTokenHash" TEXT;

-- CreateIndex
CREATE INDEX "UserSession_refreshTokenHash_idx" ON "UserSession"("refreshTokenHash");
