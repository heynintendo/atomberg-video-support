import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env';
import { verifySession, type SessionClaims } from './tokens';

export const SESSION_COOKIE = 'aq_session';

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionClaims;
  }
}

export function readSession(request: FastifyRequest): SessionClaims | null {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  try {
    return verifySession(token);
  } catch {
    return null;
  }
}

export function setSessionCookie(reply: FastifyReply, token: string, ttlSeconds: number): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ttlSeconds,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** 401 if not authenticated (no/invalid session). */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = readSession(request);
  if (!user) {
    await reply.code(401).send({ error: 'unauthenticated' });
    return;
  }
  request.user = user;
}

/** 401 if unauthenticated; 403 if authenticated but not an agent. */
export async function requireAgent(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = readSession(request);
  if (!user) {
    await reply.code(401).send({ error: 'unauthenticated' });
    return;
  }
  if (user.role !== 'agent') {
    await reply.code(403).send({ error: 'forbidden', message: 'agent role required' });
    return;
  }
  request.user = user;
}
