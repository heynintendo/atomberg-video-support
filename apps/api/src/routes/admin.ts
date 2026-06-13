import type { FastifyInstance } from 'fastify';
import type {
  AdminMetrics,
  AdminRecordingsResponse,
  AdminSessionsResponse,
} from '@atomquest/shared';
import { prisma } from '../db';
import { requireAgent } from '../auth/middleware';
import { roomService, deleteRoom } from '../lib/livekit';
import { clearSessionPresence } from '../lib/presence';
import { closeSession } from '../chat/hub';
import { recordingToDTO } from '../lib/recordingDto';
import { snapshot } from '../lib/metrics';

// Any logged-in agent is the admin (one demo agent for the demo). These views are
// read-only cross-session aggregations over existing data — no new machinery.
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/metrics', { preHandler: requireAgent }, async () => {
    const active = await prisma.session.findMany({ where: { status: 'active' } });
    let activeParticipants = 0;
    for (const s of active) {
      try {
        activeParticipants += (await roomService.listParticipants(s.roomName)).length;
      } catch {
        // room unreachable; skip
      }
    }
    const agg = await prisma.recording.aggregate({ _count: true, _sum: { sizeBytes: true } });
    const metrics: AdminMetrics = {
      counters: snapshot(),
      gauges: {
        activeSessions: active.length,
        activeParticipants,
        recordingsCount: agg._count,
        recordingsTotalBytes: agg._sum.sizeBytes === null ? 0 : Number(agg._sum.sizeBytes),
      },
    };
    return metrics;
  });

  app.get('/api/admin/sessions', { preHandler: requireAgent }, async () => {
    const rows = await prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { participants: true, recordings: true } },
      },
    });
    const now = Date.now();
    const response: AdminSessionsResponse = {
      sessions: rows.map((s) => {
        const end = s.endedAt ? s.endedAt.getTime() : now;
        return {
          id: s.id,
          roomName: s.roomName,
          status: s.status,
          agentName: s.createdBy.name,
          createdAt: s.createdAt.toISOString(),
          startedAt: s.startedAt.toISOString(),
          endedAt: s.endedAt ? s.endedAt.toISOString() : null,
          participantCount: s._count.participants,
          recordingCount: s._count.recordings,
          durationSeconds: Math.max(0, Math.round((end - s.startedAt.getTime()) / 1000)),
        };
      }),
    };
    return response;
  });

  app.get('/api/admin/recordings', { preHandler: requireAgent }, async () => {
    const rows = await prisma.recording.findMany({
      orderBy: { createdAt: 'desc' },
      include: { session: { select: { roomName: true } } },
    });
    const response: AdminRecordingsResponse = {
      recordings: rows.map((r) => ({
        ...recordingToDTO(r),
        sessionId: r.sessionId,
        roomName: r.session.roomName,
      })),
    };
    return response;
  });

  // Admin can end any live session (not just one they created).
  app.post<{ Params: { id: string } }>(
    '/api/admin/sessions/:id/end',
    { preHandler: requireAgent },
    async (request, reply) => {
      const session = await prisma.session.findUnique({ where: { id: request.params.id } });
      if (!session) {
        reply.code(404);
        return { error: 'session_not_found' };
      }
      const at = new Date();
      await deleteRoom(session.roomName);
      await prisma.participant.updateMany({
        where: { sessionId: session.id, leftAt: null },
        data: { leftAt: at },
      });
      if (session.status === 'active') {
        await prisma.session.update({
          where: { id: session.id },
          data: { status: 'ended', endedAt: at },
        });
      }
      clearSessionPresence(session.id);
      closeSession(session.id);
      return { ok: true };
    },
  );
}
