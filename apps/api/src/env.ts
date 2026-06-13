import { z } from 'zod';

/**
 * All configuration is read from the environment and validated at boot. Nothing
 * here is hardcoded in the repository; missing or malformed values fail fast.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Server-internal signaling/HTTP URL (RoomService, Egress). ws:// is converted
  // to http:// for the RoomServiceClient.
  LIVEKIT_URL: z.string().min(1, 'LIVEKIT_URL is required'),
  // Browser-facing signaling URL handed to clients in their join token response.
  // Inside compose the API reaches LiveKit at ws://livekit:7880, but the browser
  // must use the published address, so the two are configured separately.
  LIVEKIT_PUBLIC_URL: z.string().min(1).default('ws://localhost:7880'),
  LIVEKIT_API_KEY: z.string().min(1, 'LIVEKIT_API_KEY is required'),
  LIVEKIT_API_SECRET: z.string().min(1, 'LIVEKIT_API_SECRET is required'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  // Signs agent session cookies and customer invite tokens. Required (no default).
  AUTH_JWT_SECRET: z.string().min(16, 'AUTH_JWT_SECRET must be at least 16 chars'),
  // Optional JSON array of one-click demo agents: [{"email","name"}].
  SEED_AGENTS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env: Env = parsed.data;
