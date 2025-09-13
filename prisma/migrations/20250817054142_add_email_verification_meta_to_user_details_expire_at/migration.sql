/*
  Warnings:

  - You are about to drop the column `emailVerificationTokenExpiresAt` on the `UserDetails` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "UserDetails" DROP COLUMN "emailVerificationTokenExpiresAt";
