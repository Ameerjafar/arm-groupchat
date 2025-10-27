/*
  Warnings:

  - The values [DEPOSIT,TRANSFER] on the enum `TransactionType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `contributorId` on the `contributions` table. All the data in the column will be lost.
  - You are about to drop the column `signature` on the `contributions` table. All the data in the column will be lost.
  - You are about to drop the `Group` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[transactionSignature]` on the table `contributions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `contributorTelegramId` to the `contributions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contributorWallet` to the `contributions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sharesMinted` to the `contributions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `transactionSignature` to the `contributions` table without a default value. This is not possible if the table is not empty.
  - Made the column `initiator` on table `funds` required. This step will fail if there are existing NULL values in that column.

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
ALTER TABLE "User" DROP CONSTRAINT "User_groupId_fkey";

-- DropIndex
DROP INDEX "contributions_contributorId_idx";

-- DropIndex
DROP INDEX "contributions_signature_key";

-- AlterTable
ALTER TABLE "contributions" DROP COLUMN "contributorId",
DROP COLUMN "signature",
ADD COLUMN     "contributorTelegramId" TEXT NOT NULL,
ADD COLUMN     "contributorWallet" TEXT NOT NULL,
ADD COLUMN     "sharesMinted" BIGINT NOT NULL,
ADD COLUMN     "transactionSignature" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "funds" ALTER COLUMN "initiator" SET NOT NULL;

-- DropTable
DROP TABLE "Group";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "username" TEXT,
    "walletAddress" TEXT,
    "encryptedPrivateKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegramId_key" ON "users"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "users_walletAddress_key" ON "users"("walletAddress");

-- CreateIndex
CREATE INDEX "users_telegramId_idx" ON "users"("telegramId");

-- CreateIndex
CREATE INDEX "users_walletAddress_idx" ON "users"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "groups_groupId_key" ON "groups"("groupId");

-- CreateIndex
CREATE INDEX "groups_groupId_idx" ON "groups"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_transactionSignature_key" ON "contributions"("transactionSignature");

-- CreateIndex
CREATE INDEX "contributions_contributorTelegramId_idx" ON "contributions"("contributorTelegramId");

-- CreateIndex
CREATE INDEX "contributions_contributorWallet_idx" ON "contributions"("contributorWallet");

-- CreateIndex
CREATE INDEX "failed_syncs_resolved_idx" ON "failed_syncs"("resolved");

-- CreateIndex
CREATE INDEX "funds_status_idx" ON "funds"("status");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");
