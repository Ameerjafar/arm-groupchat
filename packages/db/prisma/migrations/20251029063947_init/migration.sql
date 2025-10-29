/*
  Warnings:

  - The values [PROPOSAL] on the enum `TransactionType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `proposal_approvals` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `trade_proposals` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TransactionType_new" AS ENUM ('CONTRIBUTION', 'WITHDRAWAL', 'TRADE', 'FEE');
ALTER TABLE "transactions" ALTER COLUMN "type" TYPE "TransactionType_new" USING ("type"::text::"TransactionType_new");
ALTER TYPE "TransactionType" RENAME TO "TransactionType_old";
ALTER TYPE "TransactionType_new" RENAME TO "TransactionType";
DROP TYPE "TransactionType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "proposal_approvals" DROP CONSTRAINT "proposal_approvals_proposalId_fkey";

-- DropForeignKey
ALTER TABLE "trade_proposals" DROP CONSTRAINT "trade_proposals_fundId_fkey";

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "proposal_approvals";

-- DropTable
DROP TABLE "trade_proposals";

-- DropEnum
DROP TYPE "ProposalStatus";

-- CreateIndex
CREATE INDEX "transactions_timestamp_idx" ON "transactions"("timestamp");
