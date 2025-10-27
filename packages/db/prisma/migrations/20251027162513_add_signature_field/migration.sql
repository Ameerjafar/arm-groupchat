-- AlterTable
ALTER TABLE "InitiatedTransaction" ADD COLUMN     "signature" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "privateKey" TEXT;
