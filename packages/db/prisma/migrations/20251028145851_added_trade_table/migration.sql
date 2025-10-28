-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'PROPOSAL';

-- CreateTable
CREATE TABLE "trade_proposals" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "proposalId" INTEGER NOT NULL,
    "proposalPdaAddress" TEXT NOT NULL,
    "proposerTelegramId" TEXT NOT NULL,
    "proposerWallet" TEXT NOT NULL,
    "fromToken" TEXT NOT NULL,
    "toToken" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "minimumOut" BIGINT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "approvalCount" INTEGER NOT NULL DEFAULT 0,
    "requiredApprovals" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "transactionSignature" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_approvals" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "approverTelegramId" TEXT NOT NULL,
    "approverWallet" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionSignature" TEXT,

    CONSTRAINT "proposal_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trade_proposals_proposalPdaAddress_key" ON "trade_proposals"("proposalPdaAddress");

-- CreateIndex
CREATE UNIQUE INDEX "trade_proposals_transactionSignature_key" ON "trade_proposals"("transactionSignature");

-- CreateIndex
CREATE INDEX "trade_proposals_fundId_idx" ON "trade_proposals"("fundId");

-- CreateIndex
CREATE INDEX "trade_proposals_proposalId_idx" ON "trade_proposals"("proposalId");

-- CreateIndex
CREATE INDEX "trade_proposals_status_idx" ON "trade_proposals"("status");

-- CreateIndex
CREATE INDEX "trade_proposals_proposerTelegramId_idx" ON "trade_proposals"("proposerTelegramId");

-- CreateIndex
CREATE INDEX "proposal_approvals_proposalId_idx" ON "proposal_approvals"("proposalId");

-- CreateIndex
CREATE INDEX "proposal_approvals_approverTelegramId_idx" ON "proposal_approvals"("approverTelegramId");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_approvals_proposalId_approverWallet_key" ON "proposal_approvals"("proposalId", "approverWallet");

-- AddForeignKey
ALTER TABLE "trade_proposals" ADD CONSTRAINT "trade_proposals_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "trade_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
