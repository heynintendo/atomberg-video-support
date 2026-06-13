import type { Recording } from '@prisma/client';
import type { RecordingDTO } from '@atomquest/shared';

export function recordingToDTO(r: Recording): RecordingDTO {
  return {
    id: r.id,
    status: r.status,
    durationSeconds: r.durationSeconds,
    sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes),
    error: r.error,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}
