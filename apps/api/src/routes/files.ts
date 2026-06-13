import { extname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { SESSION_COOKIE } from '../auth/middleware';
import { authenticateParticipant } from '../lib/participantAuth';
import { chatToDTO } from '../lib/chatDto';
import { broadcast } from '../chat/hub';
import { bump } from '../lib/metrics';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// Extension allowlist -> the content kind(s) that extension may legitimately be.
// Anything not listed is rejected by extension; a listed extension whose bytes
// don't match (or look executable) is rejected by content sniff.
const ALLOWED_EXT: Record<string, string[]> = {
  '.png': ['png'],
  '.jpg': ['jpeg'],
  '.jpeg': ['jpeg'],
  '.gif': ['gif'],
  '.webp': ['webp'],
  '.pdf': ['pdf'],
  '.txt': ['text'],
  '.csv': ['text'],
  '.md': ['text'],
  '.log': ['text'],
  '.doc': ['ole'],
  '.xls': ['ole'],
  '.ppt': ['ole'],
  '.docx': ['zip'],
  '.xlsx': ['zip'],
  '.pptx': ['zip'],
};

const KIND_MIME: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  text: 'text/plain',
  zip: 'application/octet-stream',
  ole: 'application/octet-stream',
};

const DANGEROUS = new Set(['elf', 'pe', 'macho', 'class', 'script']);

function matchAt(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buf[offset + i] !== bytes[i]) return false;
  return true;
}

function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 1024);
  if (sample.length === 0) return false;
  let suspicious = 0;
  for (const b of sample) {
    if (b === 0) return false; // NUL -> binary
    const printable = b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e) || b >= 0x80;
    if (!printable) suspicious++;
  }
  return suspicious / sample.length < 0.05;
}

// Sniff the real content kind from magic bytes. Executable/script signatures are
// checked FIRST so a dangerous payload can never be mistaken for an allowed type.
function sniffKind(buf: Buffer): string {
  if (buf.length === 0) return 'empty';
  if (matchAt(buf, [0x7f, 0x45, 0x4c, 0x46])) return 'elf'; // ELF
  if (matchAt(buf, [0x4d, 0x5a])) return 'pe'; // MZ / PE (Windows exe/dll)
  if (
    matchAt(buf, [0xfe, 0xed, 0xfa, 0xce]) ||
    matchAt(buf, [0xfe, 0xed, 0xfa, 0xcf]) ||
    matchAt(buf, [0xce, 0xfa, 0xed, 0xfe]) ||
    matchAt(buf, [0xcf, 0xfa, 0xed, 0xfe])
  ) {
    return 'macho';
  }
  if (matchAt(buf, [0xca, 0xfe, 0xba, 0xbe])) return 'class'; // Java class / Mach-O fat
  if (buf[0] === 0x23 && buf[1] === 0x21) return 'script'; // #! shebang
  if (matchAt(buf, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (matchAt(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (matchAt(buf, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (matchAt(buf, [0x52, 0x49, 0x46, 0x46]) && matchAt(buf, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (matchAt(buf, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
  if (
    matchAt(buf, [0x50, 0x4b, 0x03, 0x04]) ||
    matchAt(buf, [0x50, 0x4b, 0x05, 0x06]) ||
    matchAt(buf, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return 'zip'; // also docx/xlsx/pptx
  }
  if (matchAt(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole'; // legacy office
  if (looksLikeText(buf)) return 'text';
  return 'unknown';
}

function sanitizeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\x00-\x1f]/g, '').slice(0, 200).trim();
}

function dispositionName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\x00-\x1f"\\]/g, '_').replace(/[^\x20-\x7e]/g, '_');
}

interface ValidationOk {
  ok: true;
  mime: string;
}
interface ValidationErr {
  ok: false;
  error: string;
}

function validate(fileName: string, buf: Buffer): ValidationOk | ValidationErr {
  const ext = extname(fileName).toLowerCase();
  const allowedKinds = ALLOWED_EXT[ext];
  if (!allowedKinds) return { ok: false, error: 'extension_not_allowed' };
  const kind = sniffKind(buf);
  if (DANGEROUS.has(kind)) return { ok: false, error: 'blocked_content' };
  if (!allowedKinds.includes(kind)) return { ok: false, error: 'content_mismatch' };
  return { ok: true, mime: KIND_MIME[kind] ?? 'application/octet-stream' };
}

export async function registerFileRoutes(app: FastifyInstance): Promise<void> {
  // Upload a file into a session. Same participant-auth model as chat; transfer
  // goes through the backend (validated + persisted), never a data channel.
  app.post<{ Params: { id: string }; Querystring: { name?: string; invite?: string } }>(
    '/api/sessions/:id/files',
    { bodyLimit: MAX_FILE_BYTES + 1024 * 1024 },
    async (request, reply) => {
      const sessionId = request.params.id;
      const sender = await authenticateParticipant(
        request.cookies[SESSION_COOKIE],
        request.query.invite,
        sessionId,
      );
      if (!sender) {
        reply.code(401);
        return { error: 'unauthorized' };
      }
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session || session.status !== 'active') {
        reply.code(409);
        return { error: 'session_not_active' };
      }

      const buf = request.body;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        reply.code(400);
        return { error: 'empty_file' };
      }
      if (buf.length > MAX_FILE_BYTES) {
        reply.code(413);
        return { error: 'file_too_large' };
      }
      const fileName = sanitizeName(decodeURIComponent(request.query.name ?? ''));
      if (!fileName) {
        reply.code(400);
        return { error: 'missing_filename' };
      }
      const v = validate(fileName, buf);
      if (!v.ok) {
        bump('files.rejected');
        reply.code(415);
        return { error: v.error };
      }

      const msg = await prisma.chatMessage.create({
        data: {
          sessionId,
          senderIdentity: sender.identity,
          senderName: sender.name,
          senderRole: sender.role,
          body: fileName,
          type: 'file',
          attachment: {
            create: { sessionId, filename: fileName, mime: v.mime, size: buf.length, data: buf },
          },
        },
        include: { attachment: true },
      });
      bump('files.uploaded');
      broadcast(sessionId, { type: 'chat.message', message: chatToDTO(msg) });
      return { message: chatToDTO(msg) };
    },
  );

  // Download a file, auth-gated and scoped to its session. Always served as an
  // attachment with a non-executable content type and nosniff — never inline,
  // never public.
  app.get<{ Params: { id: string; fileId: string }; Querystring: { invite?: string } }>(
    '/api/sessions/:id/files/:fileId',
    async (request, reply) => {
      const sessionId = request.params.id;
      const sender = await authenticateParticipant(
        request.cookies[SESSION_COOKIE],
        request.query.invite,
        sessionId,
      );
      if (!sender) {
        reply.code(401);
        return { error: 'unauthorized' };
      }
      const att = await prisma.fileAttachment.findUnique({ where: { id: request.params.fileId } });
      if (!att || att.sessionId !== sessionId) {
        reply.code(404);
        return { error: 'file_not_found' };
      }
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${dispositionName(att.filename)}"`);
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Cache-Control', 'private, no-store');
      reply.header('Content-Length', String(att.size));
      return reply.send(Buffer.from(att.data));
    },
  );
}
