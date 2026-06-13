import { prisma } from '../db';
import { env } from '../env';

export interface SeedAgent {
  email: string;
  name: string;
}

// A public demo identity (not a secret) so judges can one-click in. The signing
// secret (AUTH_JWT_SECRET) and any real agents come from the environment.
const DEFAULT_SEED_AGENTS: SeedAgent[] = [{ email: 'demo.agent@thefoyers.club', name: 'Demo Agent' }];

export function getSeedAgents(): SeedAgent[] {
  if (!env.SEED_AGENTS) return DEFAULT_SEED_AGENTS;
  try {
    const parsed = JSON.parse(env.SEED_AGENTS) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((a): a is SeedAgent => typeof a?.email === 'string' && typeof a?.name === 'string')
    ) {
      return parsed;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_SEED_AGENTS;
}

// Upsert demo agents on boot so the one-click login always has a backing record.
export async function seedAgents(): Promise<SeedAgent[]> {
  const agents = getSeedAgents();
  for (const agent of agents) {
    await prisma.agent.upsert({
      where: { email: agent.email },
      update: { name: agent.name, isSeeded: true },
      create: { email: agent.email, name: agent.name, isSeeded: true },
    });
  }
  return agents;
}
