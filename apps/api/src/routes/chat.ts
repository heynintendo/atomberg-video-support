import type { FastifyInstance } from 'fastify';
import type { WebSocket, RawData } from 'ws';
import { prisma } from '../db';
import { SESSION_COOKIE } from '../auth/middleware';
import { authenticateParticipant } from '../lib/participantAuth';
import { chatToDTO } from '../lib/chatDto';
import { addConnection, removeConnection, broadcast, type ChatConnection } from '../chat/hub';

const MAX_LEN = 2000;
const HISTORY_LIMIT = 50;
const RATE_WINDOW_MS = 3000;
const RATE_MAX = 5;

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { invite?: string } }>(
    '/api/sessions/:id/chat',
    { websocket: true },
    async (socket: WebSocket, req) => {
      const sessionId = req.params.id;
      const sender = await authenticateParticipant(req.cookies[SESSION_COOKIE], req.query.invite, sessionId);
      if (!sender) {
        socket.close(1008, 'unauthorized');
        return;
      }

      const history = await prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        take: HISTORY_LIMIT,
        include: { attachment: true },
      });
      socket.send(JSON.stringify({ type: 'chat.history', messages: history.map(chatToDTO) }));

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
          broadcast(sessionId, { type: 'chat.message', message: chatToDTO(msg) });
        })();
      });

      socket.on('close', () => removeConnection(sessionId, conn));
    },
  );
}
