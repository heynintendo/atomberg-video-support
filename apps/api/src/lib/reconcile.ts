import type { Session } from '@prisma/client';
import { prisma } from '../db';
import { computePresence } from './presence';

/**
 * Backstop sweep. Driving the presence debounce over each active session keeps
 * DB rows converged with the authoritative RoomService view in both directions
 * (missed joins create a row, vanished participants finalize as "left" once their
 * reconnect grace window elapses) even when no agent is actively polling. So no
 * one is ever stuck "in the call forever," transient drops never churn history,
 * and a missed webhook can't leave the DB stale.
 */
export async function reconcileSession(session: Session): Promise<void> {
  await computePresence(session);
}

export async function reconcileAllActive(): Promise<void> {
  const active = await prisma.session.findMany({ where: { status: 'active' } });
  for (const session of active) {
    await reconcileSession(session).catch(() => {});
  }
}
