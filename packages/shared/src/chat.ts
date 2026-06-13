import type { ParticipantRole } from './roles';

export const MESSAGE_TYPES = ['text', 'file'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface ChatMessageDTO {
  id: string;
  sessionId: string;
  senderIdentity: string;
  senderName: string;
  senderRole: ParticipantRole;
  body: string;
  type: MessageType;
  createdAt: string;
}

/**
 * Backend-authoritative chat protocol over WebSocket. The client sends
 * `chat.send`; the backend authenticates the sender, validates session
 * membership, persists, assigns ordering, then broadcasts `chat.message`. On
 * connect the server replays recent history (`chat.history`). `clientMsgId` lets
 * a client correlate its own send across a reconnect; the backend never trusts
 * a client-supplied sender identity or ordering.
 */
export interface ChatSendFrame {
  type: 'chat.send';
  clientMsgId: string;
  body: string;
}

export interface ChatHistoryFrame {
  type: 'chat.history';
  messages: ChatMessageDTO[];
}

export interface ChatMessageFrame {
  type: 'chat.message';
  message: ChatMessageDTO;
}

export interface ChatErrorFrame {
  type: 'chat.error';
  error: string;
}

export type ChatClientFrame = ChatSendFrame;
export type ChatServerFrame = ChatHistoryFrame | ChatMessageFrame | ChatErrorFrame;
