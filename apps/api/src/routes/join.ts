import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JoinTokenResponse } from '@atomquest/shared';
import { prisma } from '../db';
import { env } from '../env';
import { verifyInvite, signSession } from '../auth/tokens';
import { setSessionCookie } from '../auth/middleware';
import { createJoinToken } from '../lib/livekit';

const joinSchema = z.object({ invite: z.string().min(1) });
const CUSTOMER_SESSION_TTL = 12 * 60 * 60;

export async function registerJoinRoutes(app: FastifyInstance): Promise<void> {
  // Customer join via signed invite. No login: the invite is the credential.
  app.post(
    '/api/join',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = joinSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      let claims;
      try {
        claims = verifyInvite(parsed.data.invite);
      } catch {
        reply.code(401);
        return { error: 'invalid_or_expired_invite' };
      }

      const invite = await prisma.invite.findUnique({ where: { id: claims.inviteId } });
      if (!invite || invite.sessionId !== claims.sessionId) {
        reply.code(401);
        return { error: 'invalid_invite' };
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        reply.code(401);
        return { error: 'invite_expired' };
      }
      const session = await prisma.session.findUnique({ where: { id: invite.sessionId } });
      if (!session || session.status !== 'active') {
        // Once the session ends, the invite is dead — it is not permanent re-entry.
        reply.code(403);
        return { error: 'session_not_active' };
      }

      // Deterministic identity from the invite: the same invite always maps to the
      // same customer identity, so a reconnect within the session is seamless.
      const identity = `customer-${invite.id.slice(0, 8)}`;
      const name = invite.customerName ?? 'Customer';

      if (!invite.used) {
        await prisma.invite.update({
          where: { id: invite.id },
          data: { used: true, usedAt: new Date() },
        });
      }

      const token = await createJoinToken({ room: session.roomName, identity, name, role: 'customer' });
      const sessionJwt = signSession(
        { sub: identity, role: 'customer', name, sessionId: session.id },
        CUSTOMER_SESSION_TTL,
      );
      setSessionCookie(reply, sessionJwt, CUSTOMER_SESSION_TTL);

      const response: JoinTokenResponse = {
        token,
        url: env.LIVEKIT_PUBLIC_URL,
        room: session.roomName,
        identity,
      };
      return response;
    },
  );
}
