import type {
  AgentsListResponse,
  AuthMeResponse,
  AuthUser,
  CreateSessionResponse,
  JoinTokenResponse,
  RecordingsListResponse,
  RecordingStartResponse,
  RoomParticipantsView,
  SessionDetail,
  SessionSummary,
} from '@atomquest/shared';

// Empty in both dev (Vite proxy) and prod (Caddy) so requests are same-origin
// and the session cookie is sent automatically.
const API_URL = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error ?? '';
    } catch {
      // ignore
    }
    throw new Error(detail || `request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function fetchAgents(): Promise<AgentsListResponse> {
  return request<AgentsListResponse>('/api/auth/agents');
}

export function demoLogin(email: string): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/api/auth/demo-login', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function logout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export function fetchMe(): Promise<AuthMeResponse> {
  return request<AuthMeResponse>('/api/auth/me');
}

export function createSession(customerName?: string): Promise<CreateSessionResponse> {
  return request<CreateSessionResponse>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ customerName }),
  });
}

export function listSessions(): Promise<{ sessions: SessionSummary[] }> {
  return request<{ sessions: SessionSummary[] }>('/api/sessions');
}

export function getAgentToken(sessionId: string): Promise<JoinTokenResponse> {
  return request<JoinTokenResponse>(`/api/sessions/${sessionId}/token`, { method: 'POST' });
}

export function endSession(sessionId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/sessions/${sessionId}/end`, { method: 'POST' });
}

export function joinWithInvite(invite: string): Promise<JoinTokenResponse> {
  return request<JoinTokenResponse>('/api/join', {
    method: 'POST',
    body: JSON.stringify({ invite }),
  });
}

// Agent-only server view (used by the in-call stats panel).
export function fetchRoomParticipants(room: string): Promise<RoomParticipantsView> {
  return request<RoomParticipantsView>(`/api/rooms/${encodeURIComponent(room)}/participants`);
}

// Session history: participants with join/leave/duration.
export function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/sessions/${sessionId}`);
}

// --- recordings (agent-only) ---
export function startRecording(sessionId: string): Promise<RecordingStartResponse> {
  return request<RecordingStartResponse>(`/api/sessions/${sessionId}/recording/start`, { method: 'POST' });
}

export function stopRecording(sessionId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/sessions/${sessionId}/recording/stop`, { method: 'POST' });
}

export function listRecordings(sessionId: string): Promise<RecordingsListResponse> {
  return request<RecordingsListResponse>(`/api/sessions/${sessionId}/recordings`);
}

// Same-origin stream URL; the agent cookie is sent automatically by the browser
// (for <video>/<a> on the same origin) and enforced server-side.
export function recordingFileUrl(id: string): string {
  return `${API_URL}/api/recordings/${id}/file`;
}
