import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AgentsListResponse, AuthMeResponse } from '@atomquest/shared';
import { prisma } from '../db';
import { getSeedAgents } from '../auth/seed';
import { signSession } from '../auth/tokens';
import { readSession, setSessionCookie, clearSessionCookie } from '../auth/middleware';

const AGENT_SESSION_TTL = 12 * 60 * 60; // 12 hours

const demoLoginSchema = z.object({ email: z.string().email() });

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // Demo identity cards rendered on the agent login screen.
  app.get('/api/auth/agents', async (): Promise<AgentsListResponse> => {
    return {
      agents: getSeedAgents().map((a) => ({ email: a.email, name: a.name })),
      // Flipped to true once the Entra app is registered and configured.
      entraEnabled: false,
    };
  });

  // One-click demo login: a real, server-signed agent session, no password by
  // design (judges one-click in). Rate-limited; only seeded demo agents allowed.
  app.post(
    '/api/auth/demo-login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = demoLoginSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      const agent = await prisma.agent.findUnique({ where: { email: parsed.data.email } });
      if (!agent || !agent.isSeeded) {
        reply.code(401);
        return { error: 'unknown_demo_agent' };
      }
      const token = signSession(
        { sub: agent.id, role: 'agent', name: agent.name, email: agent.email },
        AGENT_SESSION_TTL,
      );
      setSessionCookie(reply, token, AGENT_SESSION_TTL);
      return { user: { role: 'agent' as const, name: agent.name, email: agent.email } };
    },
  );

  app.post('/api/auth/logout', async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (request): Promise<AuthMeResponse> => {
    const claims = readSession(request);
    if (!claims) return { user: null };
    return {
      user: { role: claims.role, name: claims.name, email: claims.email, sessionId: claims.sessionId },
    };
  });

  // Entra SSO placeholder. Wired once the Entra app is registered (tenant/client/
  // secret + redirect URI). Until then it is explicit about not being configured.
  app.get('/api/auth/entra/login', async (_request, reply) => {
    reply.code(501);
    return { error: 'entra_not_configured', message: 'Microsoft sign-in is not configured yet.' };
  });
}
