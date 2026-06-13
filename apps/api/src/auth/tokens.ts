import jwt from 'jsonwebtoken';
import type { ParticipantRole } from '@atomquest/shared';
import { env } from '../env';

// Distinct audiences so a session token can never be replayed as an invite token.
const SESSION_AUD = 'atomquest:session';
const INVITE_AUD = 'atomquest:invite';

export interface SessionClaims {
  sub: string; // agent id (agent) or LiveKit identity (customer)
  role: ParticipantRole;
  name: string;
  email?: string; // agents
  sessionId?: string; // customers
}

export function signSession(claims: SessionClaims, ttlSeconds: number): string {
  return jwt.sign(claims, env.AUTH_JWT_SECRET, { audience: SESSION_AUD, expiresIn: ttlSeconds });
}

export function verifySession(token: string): SessionClaims {
  const decoded = jwt.verify(token, env.AUTH_JWT_SECRET, { audience: SESSION_AUD });
  return decoded as unknown as SessionClaims;
}

export interface InviteClaims {
  inviteId: string;
  sessionId: string;
}

export function signInvite(claims: InviteClaims, ttlSeconds: number): string {
  return jwt.sign(claims, env.AUTH_JWT_SECRET, { audience: INVITE_AUD, expiresIn: ttlSeconds });
}

export function verifyInvite(token: string): InviteClaims {
  const decoded = jwt.verify(token, env.AUTH_JWT_SECRET, { audience: INVITE_AUD });
  return decoded as unknown as InviteClaims;
}
