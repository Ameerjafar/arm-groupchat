/*
  Warnings:

  - You are about to drop the column `chatId` on the `Group` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[groupId]` on the table `Group` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `groupId` to the `Group` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Group_chatId_key";

-- AlterTable
ALTER TABLE "Group" DROP COLUMN "chatId",
ADD COLUMN     "groupId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Group_groupId_key" ON "Group"("groupId");
