/*
  Warnings:

  - Added the required column `data` to the `file_attachments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "file_attachments" ADD COLUMN     "data" BYTEA NOT NULL,
ALTER COLUMN "storagePath" DROP NOT NULL;
