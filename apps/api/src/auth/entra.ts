import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env';

// Multi-tenant + personal accounts: the /common authority (per the app registration).
const AUTHORITY = 'https://login.microsoftonline.com/common';
const SCOPES = 'openid profile email';

export function entraEnabled(): boolean {
  return Boolean(env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET);
}

function clientId(): string {
  if (!env.ENTRA_CLIENT_ID) throw new Error('ENTRA_CLIENT_ID not set');
  return env.ENTRA_CLIENT_ID;
}

// The redirect URI must match the one registered in Entra exactly.
export function redirectUri(): string {
  return `${webBase()}/api/auth/entra/callback`;
}

export function webBase(): string {
  return env.WEB_ORIGIN.split(',')[0] ?? 'https://api.thefoyers.club';
}

export function randomToken(): string {
  return randomBytes(24).toString('base64url');
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizeUrl(state: string, nonce: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPES,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
}

// Back-channel code exchange (server <-> Microsoft over TLS).
export async function exchangeCode(code: string, verifier: string): Promise<string> {
  if (!env.ENTRA_CLIENT_SECRET) throw new Error('ENTRA_CLIENT_SECRET not set');
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: env.ENTRA_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
    scope: SCOPES,
  });
  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`token exchange failed (${res.status})`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error('no id_token in token response');
  return data.id_token;
}

const jwks = createRemoteJWKSet(new URL(`${AUTHORITY}/discovery/v2.0/keys`));

export interface EntraClaims {
  oid: string;
  name?: string;
  email?: string;
}

export async function verifyIdToken(idToken: string, expectedNonce: string): Promise<EntraClaims> {
  const { payload } = await jwtVerify(idToken, jwks, { audience: clientId() });
  if (payload.nonce !== expectedNonce) throw new Error('nonce mismatch');
  const iss = String(payload.iss ?? '');
  if (!iss.startsWith('https://login.microsoftonline.com/')) {
    throw new Error('unexpected issuer');
  }
  const oid = String(payload.oid ?? payload.sub ?? '');
  if (!oid) throw new Error('token has no subject');
  const email =
    (payload.email as string | undefined) ?? (payload.preferred_username as string | undefined);
  const name = (payload.name as string | undefined) ?? email ?? 'Agent';
  return { oid, name, email };
}
