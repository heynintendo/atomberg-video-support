import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JoinTokenResponse } from '@atomquest/shared';
import { env } from '../env';
import { createJoinToken } from '../lib/livekit';

const tokenBodySchema = z.object({
  room: z.string().min(1).max(128),
  identity: z.string().min(1).max(128),
  name: z.string().max(128).optional(),
  role: z.enum(['agent', 'customer']).optional(),
});

export async function registerTokenRoutes(app: FastifyInstance): Promise<void> {
  // DEV-open in Phase 1 so two tabs can join and we can prove server-routed media.
  // Phase 3 puts this behind agent auth (for create) and signed invite verification
  // (for customer join), with role-scoped grants enforced here.
  app.post('/api/token', async (request, reply) => {
    const parsed = tokenBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request', issues: parsed.error.issues };
    }

    const { room, identity, name, role } = parsed.data;
    const token = await createJoinToken({ room, identity, name, role: role ?? 'agent' });

    const response: JoinTokenResponse = {
      token,
      url: env.LIVEKIT_PUBLIC_URL,
      room,
      identity,
    };
    return response;
  });
}
