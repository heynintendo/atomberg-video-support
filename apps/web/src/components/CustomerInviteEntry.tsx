import { type FormEvent, useState } from 'react';
import type { JoinTokenResponse } from '@atomquest/shared';
import { joinWithInvite } from '../lib/api';
import { Header } from './Header';

// Accepts a full invite link or just the token/code.
function extractToken(input: string): string {
  const t = input.trim();
  if (t.includes('invite=')) {
    try {
      return new URL(t).searchParams.get('invite') ?? t;
    } catch {
      const m = /invite=([^&\s]+)/.exec(t);
      return m?.[1] ? decodeURIComponent(m[1]) : t;
    }
  }
  return t;
}

function friendly(message: string): string {
  if (message.includes('expired') || message.includes('invalid')) {
    return 'That invite link is invalid or has expired. Ask your agent for a fresh one.';
  }
  if (message.includes('session_not_active')) return 'That call has already ended.';
  return 'We couldn’t validate that invite. Check the link and try again.';
}

export function CustomerInviteEntry({
  onJoined,
  onHome,
}: {
  onJoined: (connection: JoinTokenResponse, invite: string) => void;
  onHome: () => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const token = extractToken(value);
    if (!token) {
      setError('Paste the invite link or code your agent sent you.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onJoined(await joinWithInvite(token), token);
    } catch (e) {
      setError(friendly(e instanceof Error ? e.message : ''));
      setBusy(false);
    }
  };

  return (
    <div className="aq-app">
      <Header onHome={onHome} />
      <div className="aq-center">
        <form className="card card-pad rise" style={{ width: '100%', maxWidth: 440 }} onSubmit={submit}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Join your support call</h2>
          <p className="muted" style={{ margin: '0.3rem 0 1.3rem' }}>
            Paste the invite link your agent sent you.
          </p>
          <input
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://api.thefoyers.club/?invite=…"
            autoComplete="off"
            aria-label="Invite link or code"
          />
          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            style={{ marginTop: '1rem' }}
            disabled={busy || value.trim().length === 0}
          >
            {busy ? 'Validating…' : 'Join the call'}
          </button>
          {error && <p className="error-text" style={{ marginTop: '1rem' }}>{error}</p>}
        </form>
      </div>
    </div>
  );
}
