import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CreateSessionResponse, JoinTokenResponse, SessionSummary } from '@atomquest/shared';
import type { Session } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { requireAgent } from '../auth/middleware';
import { signInvite } from '../auth/tokens';
import { createJoinToken, ensureRoom, deleteRoom } from '../lib/livekit';

const INVITE_TTL_SECONDS = 12 * 60 * 60; // 12 hours

const createSchema = z.object({ customerName: z.string().max(128).optional() });

function toSummary(s: Session): SessionSummary {
  return {
    id: s.id,
    roomName: s.roomName,
    status: s.status,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
  };
}

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  // Agent creates a session: provision the room and mint a signed, single-session
  // invite the agent can share with the customer.
  app.post('/api/sessions', { preHandler: requireAgent }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const agentId = request.user!.sub;
    const roomName = `room_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await ensureRoom(roomName);

    const session = await prisma.session.create({
      data: { roomName, status: 'active', createdById: agentId },
    });
    const invite = await prisma.invite.create({
      data: {
        token: 'pending',
        sessionId: session.id,
        customerName: parsed.data.customerName,
        expiresAt: new Date(Date.now() + INVITE_TTL_SECONDS * 1000),
      },
    });
    const inviteToken = signInvite({ inviteId: invite.id, sessionId: session.id }, INVITE_TTL_SECONDS);
    await prisma.invite.update({ where: { id: invite.id }, data: { token: inviteToken } });

    const response: CreateSessionResponse = {
      session: toSummary(session),
      inviteUrl: `${env.WEB_ORIGIN}/?invite=${encodeURIComponent(inviteToken)}`,
    };
    return response;
  });

  // List the agent's own sessions (for the console).
  app.get('/api/sessions', { preHandler: requireAgent }, async (request) => {
    const sessions = await prisma.session.findMany({
      where: { createdById: request.user!.sub },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return { sessions: sessions.map(toSummary) };
  });

  // Mint the agent's own LiveKit token for a session they own.
  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/token',
    { preHandler: requireAgent },
    async (request, reply) => {
      const agentId = request.user!.sub;
      const session = await prisma.session.findUnique({ where: { id: request.params.id } });
      if (!session || session.createdById !== agentId) {
        reply.code(404);
        return { error: 'session_not_found' };
      }
      if (session.status !== 'active') {
        reply.code(409);
        return { error: 'session_ended' };
      }
      const identity = `agent-${agentId.slice(0, 8)}`;
      const token = await createJoinToken({
        room: session.roomName,
        identity,
        name: request.user!.name,
        role: 'agent',
      });
      const response: JoinTokenResponse = {
        token,
        url: env.LIVEKIT_PUBLIC_URL,
        room: session.roomName,
        identity,
      };
      return response;
    },
  );

  // Agent ends the session: terminate the room for everyone and close it out.
  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/end',
    { preHandler: requireAgent },
    async (request, reply) => {
      const agentId = request.user!.sub;
      const session = await prisma.session.findUnique({ where: { id: request.params.id } });
      if (!session || session.createdById !== agentId) {
        reply.code(404);
        return { error: 'session_not_found' };
      }
      await deleteRoom(session.roomName);
      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'ended', endedAt: new Date() },
      });
      return { ok: true };
    },
  );
}
