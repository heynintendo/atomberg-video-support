import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { env } from './env';
import { registerHealthRoutes } from './routes/health';
import { registerAuthRoutes } from './routes/auth';
import { registerSessionRoutes } from './routes/sessions';
import { registerJoinRoutes } from './routes/join';
import { registerRoomRoutes } from './routes/rooms';
import { registerWebhookRoutes } from './routes/webhooks';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    // Behind Caddy: trust X-Forwarded-* so rate limiting keys on the real client IP.
    trustProxy: true,
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    },
  });

  await app.register(cors, {
    origin: env.WEB_ORIGIN === '*' ? true : env.WEB_ORIGIN.split(','),
    credentials: true,
  });
  await app.register(cookie);
  // Rate limiting is opt-in per route (login/join) via route config.
  await app.register(rateLimit, { global: false });

  // LiveKit posts webhooks as application/webhook+json; keep the raw body so the
  // signature can be verified.
  app.addContentTypeParser('application/webhook+json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  await registerHealthRoutes(app);
  await registerWebhookRoutes(app);
  await registerAuthRoutes(app);
  await registerSessionRoutes(app);
  await registerJoinRoutes(app);
  await registerRoomRoutes(app);

  return app;
}
