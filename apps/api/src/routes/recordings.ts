import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { EncodedFileOutput, EncodedFileType, EncodingOptionsPreset } from 'livekit-server-sdk';
import type { RecordingsListResponse, RecordingStartResponse } from '@atomquest/shared';
import { prisma } from '../db';
import { env } from '../env';
import { requireAgent } from '../auth/middleware';
import { egressClient, setRecordingFlag } from '../lib/livekit';
import { recordingToDTO as toDTO } from '../lib/recordingDto';
import { bump } from '../lib/metrics';

// Resolve a stored basename to an absolute path under RECORDINGS_DIR, refusing
// anything with path components (defence-in-depth against traversal).
function resolveRecordingPath(fileName: string): string | null {
  if (fileName.length === 0 || basename(fileName) !== fileName) return null;
  const dir = resolve(env.RECORDINGS_DIR);
  const full = resolve(join(dir, fileName));
  if (full !== dir && !full.startsWith(dir + '/')) return null;
  return full;
}

export async function registerRecordingRoutes(app: FastifyInstance): Promise<void> {
  // Start Room Composite Egress: one 720p MP4 of the room (both participants +
  // mixed audio) written to the shared volume by the capped egress service.
  // Server-side only — never client MediaRecorder.
  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/recording/start',
    { preHandler: requireAgent },
    async (request, reply) => {
      const session = await prisma.session.findUnique({ where: { id: request.params.id } });
      if (!session || session.createdById !== request.user!.sub) {
        reply.code(404);
        return { error: 'session_not_found' };
      }
      if (session.status !== 'active') {
        reply.code(409);
        return { error: 'session_not_active' };
      }
      const existing = await prisma.recording.findFirst({
        where: { sessionId: session.id, status: { in: ['in_progress', 'processing'] } },
      });
      if (existing) {
        reply.code(409);
        return { error: 'already_recording' };
      }

      const fileName = `rec_${session.id}_${Date.now()}.mp4`;
      const output = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: join(env.RECORDINGS_DIR, fileName),
      });

      try {
        const info = await egressClient.startRoomCompositeEgress(session.roomName, output, {
          layout: 'grid',
          encodingOptions: EncodingOptionsPreset.H264_720P_30,
        });
        const rec = await prisma.recording.create({
          data: {
            sessionId: session.id,
            egressId: info.egressId,
            status: 'in_progress',
            fileName,
            startedAt: new Date(),
          },
        });
        await setRecordingFlag(session.roomName, true);
        const body: RecordingStartResponse = { recording: toDTO(rec) };
        return body;
      } catch (err) {
        app.log.error({ err }, 'failed to start egress');
        bump('egress.start_failures');
        // Record the failure so the agent sees a clear state; never crash the call.
        await prisma.recording
          .create({
            data: {
              sessionId: session.id,
              status: 'failed',
              error: err instanceof Error ? err.message : 'egress_start_failed',
              startedAt: new Date(),
              endedAt: new Date(),
            },
          })
          .catch(() => {});
        reply.code(502);
        return { error: 'recording_start_failed' };
      }
    },
  );

  // Stop the active recording. The egress_ended webhook is the source of truth
  // for completion; this only requests the stop and reflects "processing".
  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/recording/stop',
    { preHandler: requireAgent },
    async (request, reply) => {
      const session = await prisma.session.findUnique({ where: { id: request.params.id } });
      if (!session || session.createdById !== request.user!.sub) {
        reply.code(404);
        return { error: 'session_not_found' };
      }
      const rec = await prisma.recording.findFirst({
        where: { sessionId: session.id, status: 'in_progress' },
        orderBy: { createdAt: 'desc' },
      });
      if (!rec || !rec.egressId) {
        reply.code(404);
        return { error: 'no_active_recording' };
      }
      try {
        await egressClient.stopEgress(rec.egressId);
      } catch (err) {
        app.log.warn({ err }, 'stopEgress failed (it may already be stopping)');
      }
      await prisma.recording.update({ where: { id: rec.id }, data: { status: 'processing' } });
      await setRecordingFlag(session.roomName, false);
      return { ok: true };
    },
  );

  // List a session's recordings (agent-only, owner-scoped).
  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/recordings',
    { preHandler: requireAgent },
    async (request, reply) => {
      const session = await prisma.session.findUnique({ where: { id: request.params.id } });
      if (!session || session.createdById !== request.user!.sub) {
        reply.code(404);
        return { error: 'session_not_found' };
      }
      const rows = await prisma.recording.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
      });
      const body: RecordingsListResponse = { recordings: rows.map(toDTO) };
      return body;
    },
  );

  // Stream the MP4 with HTTP Range support so playback can seek. Gated on the
  // owning agent — recordings are never publicly accessible.
  app.get<{ Params: { id: string } }>(
    '/api/recordings/:id/file',
    { preHandler: requireAgent },
    async (request, reply) => {
      const rec = await prisma.recording.findUnique({ where: { id: request.params.id } });
      if (rec) {
        const session = await prisma.session.findUnique({ where: { id: rec.sessionId } });
        if (!session || session.createdById !== request.user!.sub) {
          reply.code(404);
          return { error: 'recording_not_found' };
        }
      } else {
        reply.code(404);
        return { error: 'recording_not_found' };
      }
      if (rec.status !== 'ready' || !rec.fileName) {
        reply.code(409);
        return { error: 'recording_not_ready' };
      }
      const full = resolveRecordingPath(rec.fileName);
      if (!full) {
        reply.code(400);
        return { error: 'invalid_file' };
      }

      let size: number;
      try {
        const s = await stat(full);
        if (!s.isFile()) throw new Error('not a file');
        size = s.size;
      } catch {
        reply.code(404);
        return { error: 'file_missing' };
      }

      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Type', 'video/mp4');
      reply.header('Cache-Control', 'private, no-store');

      const range = request.headers.range;
      const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
      if (m) {
        const g1 = m[1] ?? '';
        const g2 = m[2] ?? '';
        let start: number;
        let end: number;
        if (g1 === '' && g2 !== '') {
          start = Math.max(0, size - parseInt(g2, 10)); // suffix range: last N bytes
          end = size - 1;
        } else {
          start = g1 !== '' ? parseInt(g1, 10) : 0;
          end = g2 !== '' ? parseInt(g2, 10) : size - 1;
        }
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
          reply.code(416).header('Content-Range', `bytes */${size}`);
          return reply.send();
        }
        if (end >= size) end = size - 1;
        reply.code(206);
        reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
        reply.header('Content-Length', String(end - start + 1));
        return reply.send(createReadStream(full, { start, end }));
      }

      reply.header('Content-Length', String(size));
      return reply.send(createReadStream(full));
    },
  );
}
