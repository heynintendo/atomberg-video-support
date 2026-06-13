import type { ParticipantRole } from '@atomquest/shared';

// Role travels as server-trusted participant metadata ({"role":...}) set on the
// LiveKit token; fall back to the identity prefix if metadata is absent.
export function roleFromMetadata(metadata: string | undefined, identity: string): ParticipantRole {
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata) as { role?: unknown };
      if (parsed.role === 'agent' || parsed.role === 'customer') return parsed.role;
    } catch {
      // ignore malformed metadata
    }
  }
  return identity.startsWith('agent-') ? 'agent' : 'customer';
}
