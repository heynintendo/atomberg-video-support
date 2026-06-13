import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { webhookReceiver } from '../lib/livekit';
import { roleFromMetadata } from '../lib/participants';
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
      const open = await prisma.participant.findFirst({
        where: { sessionId: session.id, identity, leftAt: null },
      });
      if (!open) {
        await prisma.participant.create({
          data: {
            sessionId: session.id,
            identity,
            role: roleFromMetadata(event.participant?.metadata, identity),
            joinedAt: at,
          },
        });
      }
    } else if (event.event === 'participant_left' && identity) {
      const open = await prisma.participant.findFirst({
        where: { sessionId: session.id, identity, leftAt: null },
        orderBy: { joinedAt: 'desc' },
      });
      if (open) {
        await prisma.participant.update({ where: { id: open.id }, data: { leftAt: at } });
      }
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
      closeSession(session.id);
    }

    return { ok: true };
  });
}
