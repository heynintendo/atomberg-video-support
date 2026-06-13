import type { FastifyInstance } from 'fastify';
import type { WebSocket, RawData } from 'ws';
import type { ChatMessage } from '@prisma/client';
import type { ChatMessageDTO } from '@atomquest/shared';
import { prisma } from '../db';
import { verifySession, verifyInvite } from '../auth/tokens';
import { SESSION_COOKIE } from '../auth/middleware';
import { addConnection, removeConnection, broadcast, type ChatConnection } from '../chat/hub';

const MAX_LEN = 2000;
const HISTORY_LIMIT = 50;
const RATE_WINDOW_MS = 3000;
const RATE_MAX = 5;

interface AuthedSender {
  identity: string;
  role: 'agent' | 'customer';
  name: string;
}

function toDTO(m: ChatMessage): ChatMessageDTO {
  return {
    id: m.id,
    sessionId: m.sessionId,
    senderIdentity: m.senderIdentity,
    senderName: m.senderName,
    senderRole: m.senderRole,
    body: m.body,
    type: m.type,
    createdAt: m.createdAt.toISOString(),
  };
}

// Authenticate the WS handshake server-side. Agents present their session cookie
// and must own the session; customers present their session cookie (set on join)
// or the signed invite token. A client-supplied identity is never trusted.
async function authenticate(
  cookieToken: string | undefined,
  inviteToken: string | undefined,
  sessionId: string,
): Promise<AuthedSender | null> {
  if (cookieToken) {
    try {
      const c = verifySession(cookieToken);
      if (c.role === 'agent') {
        const session = await prisma.session.findUnique({ where: { id: sessionId } });
        if (session && session.createdById === c.sub) {
          return { identity: `agent-${c.sub.slice(0, 8)}`, role: 'agent', name: c.name };
        }
      } else if (c.role === 'customer' && c.sessionId === sessionId) {
        return { identity: c.sub, role: 'customer', name: c.name };
      }
    } catch {
      // fall through to invite check
    }
  }
  if (inviteToken) {
    try {
      const ic = verifyInvite(inviteToken);
      if (ic.sessionId === sessionId) {
        const invite = await prisma.invite.findUnique({ where: { id: ic.inviteId } });
        if (invite) {
          return {
            identity: `customer-${invite.id.slice(0, 8)}`,
            role: 'customer',
            name: invite.customerName ?? 'Customer',
          };
        }
      }
    } catch {
      // fall through
    }
  }
  return null;
}

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { invite?: string } }>(
    '/api/sessions/:id/chat',
    { websocket: true },
    async (socket: WebSocket, req) => {
      const sessionId = req.params.id;
      const sender = await authenticate(req.cookies[SESSION_COOKIE], req.query.invite, sessionId);
      if (!sender) {
        socket.close(1008, 'unauthorized');
        return;
      }

      const history = await prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        take: HISTORY_LIMIT,
      });
      socket.send(JSON.stringify({ type: 'chat.history', messages: history.map(toDTO) }));

      const conn: ChatConnection = {
        socket,
        identity: sender.identity,
        role: sender.role,
        name: sender.name,
      };
      addConnection(sessionId, conn);

      const sendTimes: number[] = [];

      socket.on('message', (raw: RawData) => {
        void (async () => {
          let frame: unknown;
          try {
            frame = JSON.parse(raw.toString());
          } catch {
            return;
          }
          if (
            typeof frame !== 'object' ||
            frame === null ||
            (frame as { type?: unknown }).type !== 'chat.send' ||
            typeof (frame as { body?: unknown }).body !== 'string'
          ) {
            return;
          }
          const body = (frame as { body: string }).body.trim();
          if (body.length === 0) return;
          if (body.length > MAX_LEN) {
            socket.send(JSON.stringify({ type: 'chat.error', error: 'message_too_long' }));
            return;
          }

          const now = Date.now();
          while (sendTimes.length > 0 && now - (sendTimes[0] ?? 0) > RATE_WINDOW_MS) sendTimes.shift();
          if (sendTimes.length >= RATE_MAX) {
            socket.send(JSON.stringify({ type: 'chat.error', error: 'rate_limited' }));
            return;
          }
          sendTimes.push(now);

          const session = await prisma.session.findUnique({ where: { id: sessionId } });
          if (!session || session.status !== 'active') {
            socket.send(JSON.stringify({ type: 'chat.error', error: 'session_ended' }));
            return;
          }

          // Stored raw; the client renders it as a text node (never as HTML).
          const msg = await prisma.chatMessage.create({
            data: {
              sessionId,
              senderIdentity: sender.identity,
              senderName: sender.name,
              senderRole: sender.role,
              body,
              type: 'text',
            },
          });
          broadcast(sessionId, { type: 'chat.message', message: toDTO(msg) });
        })();
      });

      socket.on('close', () => removeConnection(sessionId, conn));
    },
  );
}
