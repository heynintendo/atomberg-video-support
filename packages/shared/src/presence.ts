/**
 * Three presence states. `present` and `left` are derived from the authoritative
 * RoomService participant list; `reconnecting` is a transient client-side state
 * held during the reconnect grace window and cancelled on same-identity rejoin.
 */
export const PRESENCE_STATES = ['present', 'reconnecting', 'left'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export interface ParticipantPresence {
  identity: string;
  role: import('./roles').ParticipantRole;
  state: PresenceState;
}
