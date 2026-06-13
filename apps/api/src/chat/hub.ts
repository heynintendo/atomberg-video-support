import type { WebSocket } from 'ws';
import type { ChatServerFrame } from '@atomquest/shared';

export interface ChatConnection {
  socket: WebSocket;
  identity: string;
  role: 'agent' | 'customer';
  name: string;
}

// In-process registry of live chat sockets per session, used to fan out
// server-ordered messages and to force-close everyone when a session ends.
const sessions = new Map<string, Set<ChatConnection>>();

export function addConnection(sessionId: string, conn: ChatConnection): void {
  let set = sessions.get(sessionId);
  if (!set) {
    set = new Set();
    sessions.set(sessionId, set);
  }
  set.add(conn);
}

export function removeConnection(sessionId: string, conn: ChatConnection): void {
  const set = sessions.get(sessionId);
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) sessions.delete(sessionId);
}

export function broadcast(sessionId: string, frame: ChatServerFrame): void {
  const set = sessions.get(sessionId);
  if (!set) return;
  const payload = JSON.stringify(frame);
  for (const conn of set) {
    try {
      conn.socket.send(payload);
    } catch {
      // a dead socket will be cleaned up on its 'close' event
    }
  }
}

// Called when an agent ends the session (or room_finished arrives): the live
// chat closes, but persisted history remains queryable.
export function closeSession(sessionId: string): void {
  const set = sessions.get(sessionId);
  if (!set) return;
  for (const conn of set) {
    try {
      conn.socket.close(1000, 'session ended');
    } catch {
      // ignore
    }
  }
  sessions.delete(sessionId);
}
