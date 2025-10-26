-- CreateTable
CREATE TABLE "ProfitDistribution" (
    "id" SERIAL NOT NULL,
    "chatId" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "totalProfit" DOUBLE PRECISION NOT NULL,
    "distributions" TEXT NOT NULL,
    "distributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfitDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfitDistribution_chatId_idx" ON "ProfitDistribution"("chatId");
