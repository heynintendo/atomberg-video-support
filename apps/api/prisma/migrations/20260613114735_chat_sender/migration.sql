-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "senderName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "senderRole" "ParticipantRole" NOT NULL DEFAULT 'customer';
