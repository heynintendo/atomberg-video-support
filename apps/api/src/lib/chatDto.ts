import type { ChatMessage, FileAttachment } from '@prisma/client';
import type { ChatMessageDTO } from '@atomquest/shared';

export type ChatMessageWithAttachment = ChatMessage & { attachment?: FileAttachment | null };

export function chatToDTO(m: ChatMessageWithAttachment): ChatMessageDTO {
  return {
    id: m.id,
    sessionId: m.sessionId,
    senderIdentity: m.senderIdentity,
    senderName: m.senderName,
    senderRole: m.senderRole,
    body: m.body,
    type: m.type,
    createdAt: m.createdAt.toISOString(),
    attachment: m.attachment
      ? {
          id: m.attachment.id,
          fileName: m.attachment.filename,
          contentType: m.attachment.mime,
          sizeBytes: m.attachment.size,
        }
      : null,
  };
}
