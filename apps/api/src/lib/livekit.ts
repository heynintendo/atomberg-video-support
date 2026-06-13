import {
  AccessToken,
  EgressClient,
  RoomServiceClient,
  WebhookReceiver,
  type VideoGrant,
} from 'livekit-server-sdk';
import type { ParticipantRole } from '@atomquest/shared';
import { env } from '../env';

// Verifies signed LiveKit webhooks (participant/room/egress lifecycle events).
export const webhookReceiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

function toHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
}

// RoomService talks to LiveKit over HTTP on the same host/port as signaling.
export const roomService = new RoomServiceClient(
  toHttpUrl(env.LIVEKIT_URL),
  env.LIVEKIT_API_KEY,
  env.LIVEKIT_API_SECRET,
);

// Egress is dispatched through the LiveKit server (which hands jobs to the
// already-deployed, CPU-capped egress service over Redis).
export const egressClient = new EgressClient(
  toHttpUrl(env.LIVEKIT_URL),
  env.LIVEKIT_API_KEY,
  env.LIVEKIT_API_SECRET,
);

// Room-wide recording flag, surfaced to both participants for the consent banner.
// Best-effort: if the room is already gone (e.g. session just ended) this is a
// no-op, which is correct — there is nobody left to inform.
export async function setRecordingFlag(roomName: string, recording: boolean): Promise<void> {
  try {
    await roomService.updateRoomMetadata(roomName, JSON.stringify({ recording }));
  } catch {
    // room gone or unreachable; nothing to signal
  }
}

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
    ttl: '2h',
    metadata: JSON.stringify({ role }),
  });

  // Both roles publish and subscribe (it's a two-way call). Only agents get the
  // privileged grants: room admin (manage participants), create, and record.
  const grant: VideoGrant = {
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };
  if (role === 'agent') {
    grant.roomAdmin = true;
    grant.roomCreate = true;
    grant.roomRecord = true;
  }
  at.addGrant(grant);

  return at.toJwt();
}

/** Create the room up front (idempotent) so it exists with our settings. */
export async function ensureRoom(name: string): Promise<void> {
  try {
    // Keep the room alive briefly when empty so a short drop does not end it.
    await roomService.createRoom({ name, emptyTimeout: 600 });
  } catch {
    // Room may already exist; that is fine.
  }
}

/** Terminate a room for all participants (agent "End session"). */
export async function deleteRoom(name: string): Promise<void> {
  try {
    await roomService.deleteRoom(name);
  } catch {
    // Room may already be gone.
  }
}
