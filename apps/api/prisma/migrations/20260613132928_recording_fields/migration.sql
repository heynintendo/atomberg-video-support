-- AlterTable
ALTER TABLE "recordings" ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "sizeBytes" BIGINT;
