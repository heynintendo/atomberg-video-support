import type { Session } from '@prisma/client';
import { prisma } from '../db';
import { roomService } from './livekit';
import { roleFromMetadata } from './participants';

/**
 * Diff the authoritative RoomService participant list against open DB rows for a
 * session and converge them. This backstops missed webhooks in both directions:
 *  - a participant in the room with no open row -> create one (missed join)
 *  - an open row whose participant is gone       -> close it    (missed leave)
 * So no one is ever stuck "in the call forever," and history stays accurate.
 */
export async function reconcileSession(session: Session): Promise<void> {
  let live;
  try {
    live = await roomService.listParticipants(session.roomName);
  } catch {
    // Room unreachable/gone — leave closure to End/room_finished, not a transient error.
    return;
  }

  const liveByIdentity = new Map(live.map((p) => [p.identity, p]));
  const open = await prisma.participant.findMany({
    where: { sessionId: session.id, leftAt: null },
  });
  const openIdentities = new Set(open.map((p) => p.identity));
  const now = new Date();

  for (const row of open) {
    if (!liveByIdentity.has(row.identity)) {
      await prisma.participant.update({ where: { id: row.id }, data: { leftAt: now } });
    }
  }
  for (const [identity, info] of liveByIdentity) {
    if (!openIdentities.has(identity)) {
      await prisma.participant.create({
        data: {
          sessionId: session.id,
          identity,
          role: roleFromMetadata(info.metadata, identity),
        },
      });
    }
  }
}

export async function reconcileAllActive(): Promise<void> {
  const active = await prisma.session.findMany({ where: { status: 'active' } });
  for (const session of active) {
    await reconcileSession(session).catch(() => {});
  }
}
