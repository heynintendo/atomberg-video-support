import type { Participant, Session } from '@prisma/client';
import type { ParticipantPresenceEntry, ParticipantRole, PresenceState } from '@atomquest/shared';
import { prisma } from '../db';
import { roomService } from './livekit';
import { roleFromMetadata } from './participants';

// Grace window before a participant who has vanished from the authoritative
// RoomService list is finalized as "left". Within it they show as "reconnecting",
// and a same-identity return cancels the pending departure with no history churn.
// ~13s sits inside the 12-15s band the spec asks for and comfortably covers a
// LiveKit ICE/transport reconnect.
const GRACE_MS = 13_000;

// identity -> epoch ms when we first observed it absent. In-memory only; if the
// API restarts the worst case is a fresh grace window, never a wrong finalization.
const absentSince = new Map<string, number>();
const trackKey = (sessionId: string, identity: string): string => `${sessionId}::${identity}`;

/** A participant is back / confirmed in the room: cancel any pending departure. */
export function markPresent(sessionId: string, identity: string): void {
  absentSince.delete(trackKey(sessionId, identity));
}

/**
 * Start the reconnect grace clock for a participant (called when LiveKit reports
 * participant_left). Does not reset an already-running clock, so repeated signals
 * don't extend the window. Finalization happens in computePresence after grace.
 */
export function markAbsent(sessionId: string, identity: string, sinceMs: number): void {
  const k = trackKey(sessionId, identity);
  if (!absentSince.has(k)) absentSince.set(k, sinceMs);
}

/** Drop all pending state for a session (its room is closing / has ended). */
export function clearSessionPresence(sessionId: string): void {
  const prefix = `${sessionId}::`;
  for (const k of absentSince.keys()) if (k.startsWith(prefix)) absentSince.delete(k);
}

export interface PresenceResult {
  liveCount: number;
  participants: ParticipantPresenceEntry[];
}

function toEntry(row: Participant, state: PresenceState): ParticipantPresenceEntry {
  return {
    identity: row.identity,
    role: row.role as ParticipantRole,
    state,
    joinedAt: row.joinedAt.toISOString(),
    leftAt: row.leftAt ? row.leftAt.toISOString() : null,
  };
}

/**
 * Authoritative live presence with reconnect debounce. RoomService is the source
 * of truth; this reconciles the DB against it and classifies each participant as
 * present / reconnecting / left:
 *  - in the room          -> present (and any closed row is reopened, so a
 *                            same-identity rejoin maps back to the SAME row,
 *                            never a duplicate, with no leave/rejoin churn)
 *  - absent, within grace -> reconnecting (leftAt stays null)
 *  - absent, past grace    -> left (leftAt stamped at the moment they vanished)
 * It also creates rows for missed joins, so it doubles as the reconciliation
 * sweep. nowMs is injectable for deterministic tests.
 */
export async function computePresence(session: Session, nowMs: number = Date.now()): Promise<PresenceResult> {
  let live: Awaited<ReturnType<typeof roomService.listParticipants>> = [];
  let roomReachable = true;
  try {
    live = await roomService.listParticipants(session.roomName);
  } catch {
    // Room unreachable: treat as a transient error and hold, rather than
    // aggressively finalizing everyone as left on a blip.
    roomReachable = false;
  }
  const liveByIdentity = new Map(live.map((p) => [p.identity, p]));

  const rows = await prisma.participant.findMany({
    where: { sessionId: session.id },
    orderBy: { joinedAt: 'asc' },
  });
  const known = new Set(rows.map((r) => r.identity));

  // Missed-join backstop: a live participant we have no row for at all.
  for (const [identity, info] of liveByIdentity) {
    if (!known.has(identity)) {
      try {
        const created = await prisma.participant.create({
          data: { sessionId: session.id, identity, role: roleFromMetadata(info.metadata, identity) },
        });
        rows.push(created);
        known.add(identity);
      } catch {
        // a concurrent create won the race; the next pass will pick it up
      }
    }
  }

  const participants: ParticipantPresenceEntry[] = [];
  for (const row of rows) {
    if (liveByIdentity.has(row.identity)) {
      markPresent(session.id, row.identity);
      if (row.leftAt) {
        // Same-identity rejoin: reopen the existing row instead of leaving a
        // phantom "left" entry or creating a duplicate.
        const updated = await prisma.participant.update({ where: { id: row.id }, data: { leftAt: null } });
        participants.push(toEntry(updated, 'present'));
      } else {
        participants.push(toEntry(row, 'present'));
      }
      continue;
    }

    if (row.leftAt) {
      participants.push(toEntry(row, 'left'));
      continue;
    }

    if (!roomReachable) {
      participants.push(toEntry(row, 'reconnecting'));
      continue;
    }

    const k = trackKey(session.id, row.identity);
    const since = absentSince.get(k);
    if (since === undefined) {
      absentSince.set(k, nowMs);
      participants.push(toEntry(row, 'reconnecting'));
    } else if (nowMs - since >= GRACE_MS) {
      const finalized = await prisma.participant.update({
        where: { id: row.id },
        data: { leftAt: new Date(since) },
      });
      absentSince.delete(k);
      participants.push(toEntry(finalized, 'left'));
    } else {
      participants.push(toEntry(row, 'reconnecting'));
    }
  }

  return { liveCount: live.length, participants };
}
