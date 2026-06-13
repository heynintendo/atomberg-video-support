/**
 * Server-side view of a room, sourced from LiveKit RoomService (authoritative for
 * who is present and what each participant publishes). This is the data backing
 * the runtime media-proof artifact: each participant's published tracks are the
 * "up" side; the subscription fan-out ("down" side) is derived from it.
 */
export interface ServerTrackInfo {
  sid: string;
  source: string; // camera | microphone | screen_share | ...
  kind: string; // audio | video | data
  mimeType: string;
  muted: boolean;
  width?: number;
  height?: number;
  simulcast: boolean;
}

export interface ServerParticipantView {
  identity: string;
  name: string;
  sid: string;
  state: string; // joining | joined | active | disconnected
  joinedAt: string | null;
  publishedTracks: ServerTrackInfo[];
}

export interface RoomParticipantsView {
  room: string;
  capturedAt: string;
  numParticipants: number;
  participants: ServerParticipantView[];
}

export interface JoinTokenResponse {
  token: string;
  /** Browser-facing LiveKit signaling URL. */
  url: string;
  room: string;
  identity: string;
}
