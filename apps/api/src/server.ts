import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { env } from './env';
import { registerHealthRoutes } from './routes/health';
import { registerAuthRoutes } from './routes/auth';
import { registerSessionRoutes } from './routes/sessions';
import { registerJoinRoutes } from './routes/join';
import { registerRoomRoutes } from './routes/rooms';
import { registerWebhookRoutes } from './routes/webhooks';
import { registerChatRoutes } from './routes/chat';
import { registerRecordingRoutes } from './routes/recordings';
import { registerFileRoutes } from './routes/files';
import { registerAdminRoutes } from './routes/admin';
import { bump } from './lib/metrics';

const FILE_UPLOAD_LIMIT = 11 * 1024 * 1024; // 10 MB file + headroom

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
  // Backend-authoritative chat transport (wss), upgraded behind Caddy like signaling.
  await app.register(websocket);

  // LiveKit posts webhooks as application/webhook+json; keep the raw body so the
  // signature can be verified.
  app.addContentTypeParser('application/webhook+json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });
  // File uploads arrive as raw octet-stream (the client MIME is never trusted;
  // type is decided by content sniff). Capped well above the 10 MB file limit.
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: FILE_UPLOAD_LIMIT },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // Cheap request/error counters. In-memory only, wrapped so metrics can never
  // throw into a response path; runs after the response is sent.
  app.addHook('onResponse', (req, reply, done) => {
    try {
      bump('requests.total');
      const sc = reply.statusCode;
      bump(`status.${Math.floor(sc / 100)}xx`);
      if (sc >= 400) {
        bump(sc >= 500 ? 'errors.5xx' : 'errors.4xx');
        const route = req.routeOptions?.url ?? 'unknown';
        bump(`route_error.${req.method} ${route}`);
      }
    } catch {
      // metrics must never break a request
    }
    done();
  });

  await registerHealthRoutes(app);
  await registerWebhookRoutes(app);
  await registerAuthRoutes(app);
  await registerSessionRoutes(app);
  await registerJoinRoutes(app);
  await registerRoomRoutes(app);
  await registerChatRoutes(app);
  await registerRecordingRoutes(app);
  await registerFileRoutes(app);
  await registerAdminRoutes(app);

  return app;
}
