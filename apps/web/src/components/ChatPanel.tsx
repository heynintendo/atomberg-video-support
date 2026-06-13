import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import type { ChatMessageDTO } from '@atomquest/shared';
import { uploadSessionFile, fileDownloadUrl } from '../lib/api';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function uploadErrorText(code: string): string {
  switch (code) {
    case 'file_too_large':
      return 'That file is too large (max 10 MB).';
    case 'extension_not_allowed':
    case 'content_mismatch':
    case 'blocked_content':
      return 'That file type is not allowed.';
    case 'session_not_active':
      return 'This call has ended.';
    default:
      return 'Could not send that file.';
  }
}

const Clip = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.5" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

interface Props {
  messages: ChatMessageDTO[];
  connected: boolean;
  error: string | null;
  send: (body: string) => void;
  myIdentity: string;
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ messages, connected, error, send, myIdentity, sessionId, open, onClose }: Props) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !connected) return;
    send(body);
    setText('');
  };

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setUploadError(null);
    if (file.size > MAX_FILE_BYTES) {
      setUploadError(uploadErrorText('file_too_large'));
      return;
    }
    setUploading(true);
    try {
      await uploadSessionFile(sessionId, file);
      // The upload broadcasts a file message over the chat socket, so it appears
      // for both sides through the normal message path.
    } catch (err) {
      setUploadError(uploadErrorText(err instanceof Error ? err.message : ''));
    } finally {
      setUploading(false);
    }
  };

  return (
    <aside className={`aq-chat ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="aq-chat-head">
        <strong>Chat</strong>
        <span className={`aq-chat-status ${connected ? 'on' : ''}`}>
          <span className="dot" />
          {connected ? 'Live' : 'Reconnecting…'}
        </span>
        <button type="button" className="aq-chat-close" onClick={onClose} aria-label="Close chat">
          ×
        </button>
      </div>

      <div className="aq-chat-list" ref={listRef}>
        {messages.length === 0 && <p className="aq-chat-empty">No messages yet. Start the conversation.</p>}
        {messages.map((m) => {
          const mine = m.senderIdentity === myIdentity;
          const label = mine ? 'You' : m.senderRole === 'agent' ? m.senderName : m.senderName || 'Customer';
          return (
            <div key={m.id} className={`aq-msg ${mine ? 'mine' : ''}`}>
              <div className="aq-msg-meta">
                {label} · {timeOf(m.createdAt)}
              </div>
              {m.type === 'file' && m.attachment ? (
                <a
                  className="aq-file"
                  href={fileDownloadUrl(sessionId, m.attachment.id)}
                  download={m.attachment.fileName}
                >
                  <span className="aq-file-ic"><DownloadIcon /></span>
                  <span className="aq-file-meta">
                    {/* filename rendered as a text node — never as HTML */}
                    <strong>{m.attachment.fileName}</strong>
                    <span>{fmtSize(m.attachment.sizeBytes)} · Download</span>
                  </span>
                </a>
              ) : (
                // Rendered as a text node — never as HTML (XSS-safe).
                <div className="aq-msg-bubble">{m.body}</div>
              )}
            </div>
          );
        })}
      </div>

      {(error || uploadError) && (
        <p className="error-text" style={{ margin: 0, padding: '0 1rem', fontSize: 12 }}>
          {uploadError ??
            (error === 'rate_limited'
              ? 'Slow down a moment — too many messages.'
              : error === 'message_too_long'
                ? 'That message is too long.'
                : error === 'session_ended'
                  ? 'This call has ended.'
                  : 'Message could not be sent.')}
        </p>
      )}

      <form className="aq-chat-input" onSubmit={submit}>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => void onPickFile(e)}
          accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.md,.log,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        />
        <button
          type="button"
          className="aq-chat-attach"
          onClick={() => fileRef.current?.click()}
          disabled={!connected || uploading}
          aria-label="Attach a file"
          title="Attach a file (max 10 MB)"
        >
          <Clip />
        </button>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={uploading ? 'Sending file…' : connected ? 'Type a message…' : 'Reconnecting…'}
          disabled={!connected}
          maxLength={2000}
          aria-label="Message"
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!connected || !text.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
