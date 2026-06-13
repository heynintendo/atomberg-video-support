// Recording lifecycle as surfaced to the agent console. Mirrors the Prisma
// RecordingStatus enum: in_progress (egress running) -> processing (stopping /
// finalizing) -> ready (playable), or failed.
export const RECORDING_STATUSES = ['in_progress', 'processing', 'ready', 'failed'] as const;
export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

export interface RecordingDTO {
  id: string;
  status: RecordingStatus;
  durationSeconds: number | null;
  sizeBytes: number | null;
  error: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface RecordingsListResponse {
  recordings: RecordingDTO[];
}

export interface RecordingStartResponse {
  recording: RecordingDTO;
}
