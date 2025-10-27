-- CreateEnum
CREATE TYPE "FundStatus" AS ENUM ('ACTIVE', 'CLOSED', 'PAUSED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "telegramId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "walletAddress" TEXT,
    "encryptedPrivateKey" TEXT NOT NULL,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funds" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fundPdaAddress" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "initiator" TEXT,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "transactionSignature" TEXT,
    "fundName" TEXT NOT NULL,
    "minContribution" BIGINT NOT NULL,
    "tradingFeeBps" INTEGER NOT NULL,
    "lastSyncedSlot" BIGINT,
    "status" "FundStatus" NOT NULL DEFAULT 'ACTIVE',
    "isRecovered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "signature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "signature" TEXT NOT NULL,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "initiator" TEXT,
    "status" "TxStatus" NOT NULL DEFAULT 'PENDING',
    "slot" BIGINT,
    "blockTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_syncs" (
    "id" TEXT NOT NULL,
    "fundPdaAddress" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "failed_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Group_groupId_key" ON "Group"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "funds_groupId_key" ON "funds"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "funds_fundPdaAddress_key" ON "funds"("fundPdaAddress");

-- CreateIndex
CREATE INDEX "funds_groupId_idx" ON "funds"("groupId");

-- CreateIndex
CREATE INDEX "funds_fundPdaAddress_idx" ON "funds"("fundPdaAddress");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_signature_key" ON "contributions"("signature");

-- CreateIndex
CREATE INDEX "contributions_fundId_idx" ON "contributions"("fundId");

-- CreateIndex
CREATE INDEX "contributions_contributorId_idx" ON "contributions"("contributorId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_signature_key" ON "transactions"("signature");

-- CreateIndex
CREATE INDEX "transactions_fundId_idx" ON "transactions"("fundId");

-- CreateIndex
CREATE INDEX "transactions_signature_idx" ON "transactions"("signature");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("groupId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
