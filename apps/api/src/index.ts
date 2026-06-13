import { buildServer } from './server';
import { env } from './env';
import { prisma } from './db';
import { seedAgents } from './auth/seed';

async function main(): Promise<void> {
  const app = await buildServer();

  try {
    const seeded = await seedAgents();
    app.log.info({ count: seeded.length }, 'seeded demo agents');
  } catch (err) {
    app.log.error({ err }, 'failed to seed demo agents');
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
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
