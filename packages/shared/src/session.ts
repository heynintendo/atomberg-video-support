export const SESSION_STATUSES = ['active', 'ended'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export interface SessionSummary {
  id: string;
  roomName: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
}

export interface CreateSessionRequest {
  /** Optional human label for the customer the agent expects to join. */
  customerName?: string;
}

export interface CreateSessionResponse {
  session: SessionSummary;
  /** Signed, single-session invite link the agent shares with the customer. */
  inviteUrl: string;
}

export interface ParticipantHistoryEntry {
  identity: string;
  role: import('./roles').ParticipantRole;
  joinedAt: string;
  leftAt: string | null;
  /** Seconds in the room (to leftAt, or to now if still present). */
  durationSeconds: number;
}

export interface SessionDetail {
  session: SessionSummary;
  participants: ParticipantHistoryEntry[];
}
