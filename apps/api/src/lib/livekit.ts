import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import type { ParticipantRole } from '@atomquest/shared';
import { env } from '../env';

function toHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
}

// RoomService talks to LiveKit over HTTP on the same host/port as signaling.
export const roomService = new RoomServiceClient(
  toHttpUrl(env.LIVEKIT_URL),
  env.LIVEKIT_API_KEY,
  env.LIVEKIT_API_SECRET,
);

export interface JoinTokenParams {
  room: string;
  identity: string;
  name?: string;
  role: ParticipantRole;
}

export async function createJoinToken(params: JoinTokenParams): Promise<string> {
  const { room, identity, name, role } = params;

  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: '1h',
    // Role travels as server-trusted participant metadata; grants are scoped by
    // role in Phase 3 (agents create/end/record, customers join-only).
    metadata: JSON.stringify({ role }),
  });

  // Phase 1: both roles publish and subscribe so two tabs see and hear each other.
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return at.toJwt();
}
