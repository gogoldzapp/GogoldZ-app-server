-- CreateTable
CREATE TABLE "RevokedRefreshToken" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedRefreshToken_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "RevokedRefreshToken_userId_idx" ON "RevokedRefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RevokedRefreshToken_expiresAt_idx" ON "RevokedRefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Activity_userId_createdAt_idx" ON "Activity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");
