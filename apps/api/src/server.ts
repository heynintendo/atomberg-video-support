import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from './env';
import { registerHealthRoutes } from './routes/health';
import { registerTokenRoutes } from './routes/token';
import { registerRoomRoutes } from './routes/rooms';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    },
  });

  await app.register(cors, {
    origin: env.WEB_ORIGIN === '*' ? true : env.WEB_ORIGIN.split(','),
    credentials: true,
  });

  await registerHealthRoutes(app);
  await registerTokenRoutes(app);
  await registerRoomRoutes(app);

  return app;
}
