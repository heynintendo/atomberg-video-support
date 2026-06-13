import type { SessionStatus } from './session';
import type { RecordingDTO } from './recordings';

export interface AdminMetrics {
  counters: Record<string, number>;
  gauges: {
    activeSessions: number;
    activeParticipants: number;
    recordingsCount: number;
    recordingsTotalBytes: number;
  };
}

export interface AdminSessionSummary {
  id: string;
  roomName: string;
  status: SessionStatus;
  agentName: string;
  createdAt: string;
  startedAt: string;
  endedAt: string | null;
  participantCount: number;
  recordingCount: number;
  durationSeconds: number;
}

export interface AdminSessionsResponse {
  sessions: AdminSessionSummary[];
}

export interface AdminRecordingEntry extends RecordingDTO {
  sessionId: string;
  roomName: string;
}

export interface AdminRecordingsResponse {
  recordings: AdminRecordingEntry[];
}
