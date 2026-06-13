import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AgentsListResponse, AuthMeResponse } from '@atomquest/shared';
import { prisma } from '../db';
import { env } from '../env';
import { getSeedAgents } from '../auth/seed';
import { signSession, signEntraState, verifyEntraState } from '../auth/tokens';
import { readSession, setSessionCookie, clearSessionCookie } from '../auth/middleware';
import {
  entraEnabled,
  buildAuthorizeUrl,
  exchangeCode,
  verifyIdToken,
  pkce,
  randomToken,
  webBase,
} from '../auth/entra';

const AGENT_SESSION_TTL = 12 * 60 * 60; // 12 hours
const ENTRA_FLOW_COOKIE = 'aq_entra_flow';
const ENTRA_FLOW_TTL = 10 * 60; // 10 minutes

const demoLoginSchema = z.object({ email: z.string().email() });

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // Demo identity cards rendered on the agent login screen.
  app.get('/api/auth/agents', async (): Promise<AgentsListResponse> => {
    return {
      agents: getSeedAgents().map((a) => ({ email: a.email, name: a.name })),
      entraEnabled: entraEnabled(),
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

  // Begin Microsoft Entra sign-in (additive; the demo path is untouched).
  app.get('/api/auth/entra/login', async (_request, reply) => {
    if (!entraEnabled()) {
      reply.code(501);
      return { error: 'entra_not_configured' };
    }
    const state = randomToken();
    const nonce = randomToken();
    const { verifier, challenge } = pkce();
    const flow = signEntraState({ state, nonce, cv: verifier }, ENTRA_FLOW_TTL);
    reply.setCookie(ENTRA_FLOW_COOKIE, flow, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ENTRA_FLOW_TTL,
    });
    return reply.redirect(buildAuthorizeUrl(state, nonce, challenge));
  });

  // OAuth callback: exchange the code, verify the ID token, provision/lookup the
  // agent by entraOid, and issue the same agent session the demo login issues.
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/entra/callback',
    async (request, reply) => {
      if (!entraEnabled()) {
        reply.code(501);
        return { error: 'entra_not_configured' };
      }
      const { code, state, error } = request.query;
      if (error) {
        return reply.redirect(`${webBase()}/?sso_error=${encodeURIComponent(error)}`);
      }
      const flowCookie = request.cookies[ENTRA_FLOW_COOKIE];
      if (!code || !state || !flowCookie) {
        reply.code(400);
        return { error: 'invalid_callback' };
      }
      reply.clearCookie(ENTRA_FLOW_COOKIE, { path: '/' });

      let flow;
      try {
        flow = verifyEntraState(flowCookie);
      } catch {
        reply.code(400);
        return { error: 'invalid_flow' };
      }
      if (flow.state !== state) {
        reply.code(400);
        return { error: 'state_mismatch' };
      }

      let claims;
      try {
        const idToken = await exchangeCode(code, flow.cv);
        claims = await verifyIdToken(idToken, flow.nonce);
      } catch (err) {
        app.log.error({ err }, 'entra callback failed');
        return reply.redirect(`${webBase()}/?sso_error=auth_failed`);
      }

      const email = claims.email ?? `entra-${claims.oid}@thefoyers.club`;
      const agent = await prisma.agent.upsert({
        where: { entraOid: claims.oid },
        create: { entraOid: claims.oid, email, name: claims.name ?? 'Agent', isSeeded: false },
        update: { name: claims.name ?? undefined },
      });

      const token = signSession(
        { sub: agent.id, role: 'agent', name: agent.name, email: agent.email },
        AGENT_SESSION_TTL,
      );
      setSessionCookie(reply, token, AGENT_SESSION_TTL);
      return reply.redirect(webBase());
    },
  );
}
