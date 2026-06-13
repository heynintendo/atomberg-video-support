import { buildServer } from './server';
import { env } from './env';
import { prisma } from './db';
import { seedAgents } from './auth/seed';
import { reconcileAllActive } from './lib/reconcile';

const RECONCILE_INTERVAL_MS = 20_000;

async function main(): Promise<void> {
  const app = await buildServer();

  try {
    const seeded = await seedAgents();
    app.log.info({ count: seeded.length }, 'seeded demo agents');
  } catch (err) {
    app.log.error({ err }, 'failed to seed demo agents');
  }

  // Backstop sweep: keep DB participant rows in sync with the authoritative
  // RoomService view so nothing is ever stuck "in the call," even if a webhook
  // is missed.
  const reconcileTimer = setInterval(() => {
    reconcileAllActive().catch((err: unknown) => app.log.error({ err }, 'reconcile sweep failed'));
  }, RECONCILE_INTERVAL_MS);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    clearInterval(reconcileTimer);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

void main();
