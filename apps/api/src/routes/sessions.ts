import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  CreateSessionResponse,
  JoinTokenResponse,
  ParticipantHistoryEntry,
  ParticipantPresenceEntry,
  PresenceState,
  SessionDetail,
  SessionPresenceView,
  SessionSummary,
} from '@atomquest/shared';
import type { Session } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { requireAgent } from '../auth/middleware';
import { signInvite } from '../auth/tokens';
import { createJoinToken, ensureRoom, deleteRoom, roomService } from '../lib/livekit';
import { reconcileSession } from '../lib/reconcile';

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
        sessionId: session.id,
      };
      return response;
    },
  );

  // Session history: who joined, when, and for how long. Accurate even if a
  // webhook was missed, because the reconciliation sweep keeps rows honest.
  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id',
    { preHandler: requireAgent },
    async (request, reply) => {
      const session = await prisma.session.findUnique({ where: { id: request.params.id } });
      if (!session || session.createdById !== request.user!.sub) {
        reply.code(404);
        return { error: 'session_not_found' };
      }
      const rows = await prisma.participant.findMany({
        where: { sessionId: session.id },
        orderBy: { joinedAt: 'asc' },
      });
      const now = Date.now();
      const participants: ParticipantHistoryEntry[] = rows.map((r) => {
        const end = r.leftAt ? r.leftAt.getTime() : now;
        return {
          identity: r.identity,
          role: r.role,
          joinedAt: r.joinedAt.toISOString(),
          leftAt: r.leftAt ? r.leftAt.toISOString() : null,
          durationSeconds: Math.max(0, Math.round((end - r.joinedAt.getTime()) / 1000)),
        };
      });
      const detail: SessionDetail = { session: toSummary(session), participants };
      return detail;
    },
  );

  // Live presence — RoomService is authoritative. Reconcile first so a missed
  // webhook can't leave the DB stale, then report present/left per participant.
  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/presence',
    { preHandler: requireAgent },
    async (request, reply) => {
      const session = await prisma.session.findUnique({ where: { id: request.params.id } });
      if (!session || session.createdById !== request.user!.sub) {
        reply.code(404);
        return { error: 'session_not_found' };
      }
      await reconcileSession(session).catch(() => {});

      let live: Awaited<ReturnType<typeof roomService.listParticipants>> = [];
      try {
        live = await roomService.listParticipants(session.roomName);
      } catch {
        // room gone; everyone is left
      }
      const liveIdentities = new Set(live.map((p) => p.identity));

      const rows = await prisma.participant.findMany({
        where: { sessionId: session.id },
        orderBy: { joinedAt: 'asc' },
      });
      const participants: ParticipantPresenceEntry[] = rows.map((r) => {
        const state: PresenceState = r.leftAt
          ? 'left'
          : liveIdentities.has(r.identity)
            ? 'present'
            : 'left';
        return {
          identity: r.identity,
          role: r.role,
          state,
          joinedAt: r.joinedAt.toISOString(),
          leftAt: r.leftAt ? r.leftAt.toISOString() : null,
        };
      });

      const view: SessionPresenceView = {
        sessionId: session.id,
        roomName: session.roomName,
        status: session.status,
        liveCount: live.length,
        participants,
      };
      return view;
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
      const at = new Date();
      await deleteRoom(session.roomName);
      // Close the session and everyone still open (room_finished webhook backstops this).
      await prisma.participant.updateMany({
        where: { sessionId: session.id, leftAt: null },
        data: { leftAt: at },
      });
      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'ended', endedAt: at },
      });
      return { ok: true };
    },
  );
}
