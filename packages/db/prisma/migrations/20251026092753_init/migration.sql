-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('INITIATED', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "InitiatedTransaction" (
    "id" SERIAL NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "fromToken" TEXT NOT NULL,
    "toToken" TEXT NOT NULL,
    "fromAmount" DECIMAL(20,8) NOT NULL,
    "estimatedToAmount" DECIMAL(20,8) NOT NULL,
    "fromTokenPrice" DECIMAL(20,8) NOT NULL,
    "toTokenPrice" DECIMAL(20,8) NOT NULL,
    "estimatedValueUSD" DECIMAL(20,8) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'INITIATED',
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "priceSource" TEXT NOT NULL DEFAULT 'binance',
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "InitiatedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InitiatedTransaction_transactionId_key" ON "InitiatedTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "InitiatedTransaction_userId_idx" ON "InitiatedTransaction"("userId");

-- CreateIndex
CREATE INDEX "InitiatedTransaction_chatId_idx" ON "InitiatedTransaction"("chatId");

-- CreateIndex
CREATE INDEX "InitiatedTransaction_status_idx" ON "InitiatedTransaction"("status");

-- CreateIndex
CREATE INDEX "InitiatedTransaction_initiatedAt_idx" ON "InitiatedTransaction"("initiatedAt");

-- AddForeignKey
ALTER TABLE "InitiatedTransaction" ADD CONSTRAINT "InitiatedTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
