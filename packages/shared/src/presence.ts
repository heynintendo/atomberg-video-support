import type { ParticipantRole } from './roles';
import type { SessionStatus } from './session';

/**
 * Three presence states. `present` and `left` are derived from the authoritative
 * RoomService participant list; `reconnecting` is a transient client-side state
 * held during the reconnect grace window and cancelled on same-identity rejoin
 * (the debounce that drives it lands in Phase 7; the data model carries it now).
 */
export const PRESENCE_STATES = ['present', 'reconnecting', 'left'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export interface ParticipantPresenceEntry {
  identity: string;
  role: ParticipantRole;
  state: PresenceState;
  joinedAt: string;
  leftAt: string | null;
}

export interface SessionPresenceView {
  sessionId: string;
  roomName: string;
  status: SessionStatus;
  /** Count of participants RoomService reports as currently in the room. */
  liveCount: number;
  participants: ParticipantPresenceEntry[];
}
