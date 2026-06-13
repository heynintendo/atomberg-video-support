import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { ChatMessageDTO } from '@atomquest/shared';

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  messages: ChatMessageDTO[];
  connected: boolean;
  error: string | null;
  send: (body: string) => void;
  myIdentity: string;
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ messages, connected, error, send, myIdentity, open, onClose }: Props) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

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
              {/* Rendered as a text node — never as HTML (XSS-safe). */}
              <div className="aq-msg-bubble">{m.body}</div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="error-text" style={{ margin: 0, padding: '0 1rem', fontSize: 12 }}>
          {error === 'rate_limited'
            ? 'Slow down a moment — too many messages.'
            : error === 'message_too_long'
              ? 'That message is too long.'
              : error === 'session_ended'
                ? 'This call has ended.'
                : 'Message could not be sent.'}
        </p>
      )}

      <form className="aq-chat-input" onSubmit={submit}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={connected ? 'Type a message…' : 'Reconnecting…'}
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
