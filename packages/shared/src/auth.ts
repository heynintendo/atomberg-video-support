import type { ParticipantRole } from './roles';

/** A one-click demo identity shown on the agent login screen. */
export interface AgentCard {
  email: string;
  name: string;
}

export interface AgentsListResponse {
  agents: AgentCard[];
  /** Whether "Sign in with Microsoft" (Entra OAuth) is configured and live. */
  entraEnabled: boolean;
}

export interface DemoLoginRequest {
  email: string;
}

export interface AuthUser {
  role: ParticipantRole;
  name: string;
  email?: string;
  sessionId?: string;
}

export interface AuthMeResponse {
  user: AuthUser | null;
}

export interface JoinWithInviteRequest {
  invite: string;
}
