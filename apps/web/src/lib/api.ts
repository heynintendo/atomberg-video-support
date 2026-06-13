import type {
  JoinTokenResponse,
  ParticipantRole,
  RoomParticipantsView,
} from '@atomquest/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export async function fetchJoinToken(input: {
  room: string;
  identity: string;
  name?: string;
  role?: ParticipantRole;
}): Promise<JoinTokenResponse> {
  const res = await fetch(`${API_URL}/api/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`token request failed (${res.status})`);
  }
  return res.json() as Promise<JoinTokenResponse>;
}

export async function fetchRoomParticipants(room: string): Promise<RoomParticipantsView> {
  const res = await fetch(`${API_URL}/api/rooms/${encodeURIComponent(room)}/participants`);
  if (!res.ok) {
    throw new Error(`participants request failed (${res.status})`);
  }
  return res.json() as Promise<RoomParticipantsView>;
}
