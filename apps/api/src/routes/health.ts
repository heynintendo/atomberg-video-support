import type { FastifyInstance } from 'fastify';
import type { HealthResponse, ReadyResponse } from '@atomquest/shared';
import { prisma } from '../db';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness: the process is up and serving. No external dependencies touched.
  app.get('/health', async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      service: 'atomquest-api',
      time: new Date().toISOString(),
    };
  });

  // Readiness: the database is reachable. Used by the container healthcheck path
  // and by deploy orchestration before routing traffic.
  app.get('/readyz', async (_request, reply): Promise<ReadyResponse> => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', db: 'up' };
    } catch (err) {
      app.log.error({ err }, 'readiness check failed');
      reply.code(503);
      return { status: 'unready', db: 'down' };
    }
  });
}
