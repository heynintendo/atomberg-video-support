import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { webhookReceiver } from '../lib/livekit';
import { roleFromMetadata } from '../lib/participants';
import { markPresent, markAbsent, clearSessionPresence } from '../lib/presence';
import { closeSession } from '../chat/hub';

// LiveKit posts signed lifecycle events here. These populate the historical event
// log and the participant join/leave timeline. The live view is never sourced
// from webhooks — RoomService is authoritative for that (reconciliation backstops
// any missed event).
export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/webhooks/livekit', async (request, reply) => {
    let event;
    try {
      event = await webhookReceiver.receive(request.body as string, request.headers.authorization);
    } catch (err) {
      app.log.warn({ err }, 'rejected unsigned/invalid LiveKit webhook');
      reply.code(401);
      return { error: 'invalid_signature' };
    }

    const roomName = event.room?.name;
    if (!roomName) return { ok: true };
    const session = await prisma.session.findUnique({ where: { roomName } });
    if (!session) return { ok: true }; // not one of our sessions

    const at = new Date();
    const identity = event.participant?.identity;

    await prisma.auditEvent
      .create({
        data: {
          sessionId: session.id,
          type: event.event,
          actor: identity,
          payload: { room: roomName, participant: identity ?? null },
        },
      })
      .catch(() => {});

    if (event.event === 'participant_joined' && identity) {
      // Cancel any pending reconnect grace and map back to the SAME participant
      // row (reopening a finalized one) so a rejoin never creates a duplicate.
      markPresent(session.id, identity);
      const existing = await prisma.participant.findFirst({
        where: { sessionId: session.id, identity },
        orderBy: { joinedAt: 'desc' },
      });
      if (!existing) {
        await prisma.participant.create({
          data: {
            sessionId: session.id,
            identity,
            role: roleFromMetadata(event.participant?.metadata, identity),
            joinedAt: at,
          },
        });
      } else if (existing.leftAt) {
        await prisma.participant.update({ where: { id: existing.id }, data: { leftAt: null } });
      }
    } else if (event.event === 'participant_left' && identity) {
      // Do NOT finalize here: a brief drop may recover. Start the grace clock; the
      // presence debounce / reconcile sweep stamps leftAt only if no same-identity
      // return happens within the window. RoomService stays authoritative.
      markAbsent(session.id, identity, at.getTime());
    } else if (event.event === 'room_finished') {
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
    }

    return { ok: true };
  });
}
