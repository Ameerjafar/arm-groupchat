-- CreateTable
CREATE TABLE "ProfitDistribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "txSignature" TEXT NOT NULL,
    "distributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfitDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfitDistribution_txSignature_key" ON "ProfitDistribution"("txSignature");

-- CreateIndex
CREATE INDEX "ProfitDistribution_userId_idx" ON "ProfitDistribution"("userId");

-- CreateIndex
CREATE INDEX "ProfitDistribution_fundId_idx" ON "ProfitDistribution"("fundId");

-- CreateIndex
CREATE INDEX "ProfitDistribution_distributedAt_idx" ON "ProfitDistribution"("distributedAt");

-- AddForeignKey
ALTER TABLE "ProfitDistribution" ADD CONSTRAINT "ProfitDistribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("telegramId") ON DELETE RESTRICT ON UPDATE CASCADE;
