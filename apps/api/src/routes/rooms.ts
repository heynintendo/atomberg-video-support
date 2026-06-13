import type { FastifyInstance } from 'fastify';
import type {
  RoomParticipantsView,
  ServerParticipantView,
  ServerTrackInfo,
} from '@atomquest/shared';
import { roomService } from '../lib/livekit';
import { requireAgent } from '../auth/middleware';

// LiveKit protocol enums arrive as numbers; map them to readable labels.
const TRACK_TYPE: Record<number, string> = { 0: 'audio', 1: 'video', 2: 'data' };
const TRACK_SOURCE: Record<number, string> = {
  0: 'unknown',
  1: 'camera',
  2: 'microphone',
  3: 'screen_share',
  4: 'screen_share_audio',
};
const PARTICIPANT_STATE: Record<number, string> = {
  0: 'joining',
  1: 'joined',
  2: 'active',
  3: 'disconnected',
};

export async function registerRoomRoutes(app: FastifyInstance): Promise<void> {
  // Authoritative live view from LiveKit RoomService: who is present and which
  // tracks each participant publishes (the "up" side). This is the server's own
  // account of the room, not anything the browser reports.
  app.get<{ Params: { room: string } }>(
    '/api/rooms/:room/participants',
    { preHandler: requireAgent },
    async (request, reply) => {
      const { room } = request.params;
      try {
        const infos = await roomService.listParticipants(room);
        const participants: ServerParticipantView[] = infos.map((p) => {
          const publishedTracks: ServerTrackInfo[] = (p.tracks ?? []).map((t) => ({
            sid: t.sid,
            source: TRACK_SOURCE[t.source as number] ?? 'unknown',
            kind: TRACK_TYPE[t.type as number] ?? 'unknown',
            mimeType: t.mimeType,
            muted: t.muted,
            width: t.width || undefined,
            height: t.height || undefined,
            simulcast: t.simulcast,
          }));
          const joinedAtSec = Number(p.joinedAt ?? 0n);
          return {
            identity: p.identity,
            name: p.name,
            sid: p.sid,
            state: PARTICIPANT_STATE[p.state as number] ?? 'unknown',
            joinedAt: joinedAtSec > 0 ? new Date(joinedAtSec * 1000).toISOString() : null,
            publishedTracks,
          };
        });

        const view: RoomParticipantsView = {
          room,
          capturedAt: new Date().toISOString(),
          numParticipants: participants.length,
          participants,
        };
        return view;
      } catch (err) {
        app.log.error({ err, room }, 'failed to list participants');
        reply.code(502);
        return { error: 'roomservice_unavailable' };
      }
    },
  );
}
