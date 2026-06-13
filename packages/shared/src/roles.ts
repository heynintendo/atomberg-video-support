/**
 * Two asymmetric roles. Agents authenticate (Entra SSO or seeded login) and may
 * create, end, and record sessions. Customers join a single session via a signed
 * invite token and have join-only privileges. Role is always enforced server-side.
 */
export const PARTICIPANT_ROLES = ['agent', 'customer'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export function isParticipantRole(value: string): value is ParticipantRole {
  return (PARTICIPANT_ROLES as readonly string[]).includes(value);
}
