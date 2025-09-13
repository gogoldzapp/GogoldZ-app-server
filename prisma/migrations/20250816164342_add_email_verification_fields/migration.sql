-- AlterTable
ALTER TABLE "UserDetails" ADD COLUMN     "emailVerificationToken" TEXT,
ADD COLUMN     "emailVerified" BOOLEAN DEFAULT false;
