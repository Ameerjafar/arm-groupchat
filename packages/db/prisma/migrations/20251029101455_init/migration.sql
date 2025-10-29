/*
  Warnings:

  - You are about to drop the `ProfitDistribution` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProfitDistribution" DROP CONSTRAINT "ProfitDistribution_userId_fkey";

-- DropTable
DROP TABLE "ProfitDistribution";

-- CreateTable
CREATE TABLE "Distribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "profitOrLoss" TEXT NOT NULL,
    "sharesBurned" TEXT NOT NULL,
    "txSignature" TEXT NOT NULL,
    "distributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Distribution_txSignature_key" ON "Distribution"("txSignature");

-- CreateIndex
CREATE INDEX "Distribution_userId_idx" ON "Distribution"("userId");

-- CreateIndex
CREATE INDEX "Distribution_fundId_idx" ON "Distribution"("fundId");

-- CreateIndex
CREATE INDEX "Distribution_distributedAt_idx" ON "Distribution"("distributedAt");

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("telegramId") ON DELETE RESTRICT ON UPDATE CASCADE;
