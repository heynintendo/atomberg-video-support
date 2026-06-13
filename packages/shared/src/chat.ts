export const MESSAGE_TYPES = ['text', 'file'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface ChatMessageDTO {
  id: string;
  sessionId: string;
  senderIdentity: string;
  body: string;
  type: MessageType;
  createdAt: string;
}

/**
 * Backend-authoritative chat protocol. The client sends `chat.send`; the backend
 * persists, then broadcasts `chat.message` to the room. Each client send carries
 * a `clientMsgId` so the backend can de-duplicate across a WS reconnect.
 */
export interface ChatSendFrame {
  type: 'chat.send';
  clientMsgId: string;
  body: string;
}

export interface ChatMessageFrame {
  type: 'chat.message';
  message: ChatMessageDTO;
}

export type ChatClientFrame = ChatSendFrame;
export type ChatServerFrame = ChatMessageFrame;
