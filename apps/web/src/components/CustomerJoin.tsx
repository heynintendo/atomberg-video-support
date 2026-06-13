import { useState } from 'react';
import type { JoinTokenResponse } from '@atomquest/shared';
import { joinWithInvite } from '../lib/api';
import { Header } from './Header';

interface Props {
  invite: string;
  onJoin: (connection: JoinTokenResponse) => void;
}

// Deep-link target: opening an invite URL lands here directly (bypassing the
// landing/chooser), exactly as before.
export function CustomerJoin({ invite, onJoin }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      onJoin(await joinWithInvite(invite));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not join the call');
      setBusy(false);
    }
  };

  return (
    <div className="aq-app">
      <Header />
      <div className="aq-center">
        <div className="card card-pad rise" style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <div
            className="aq-choice-icon"
            style={{ background: 'var(--yellow-tint)', color: 'var(--yellow-strong)', margin: '0 auto 1rem' }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="13" height="12" rx="3" />
              <path d="M15 10l6-3.5v11L15 14" />
            </svg>
          </div>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>You&apos;re invited to a support call</h2>
          <p className="muted" style={{ margin: '0.5rem 0 1.4rem' }}>
            An Atomberg expert is ready to help you, live on video.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block btn-lg"
            onClick={() => void join()}
            disabled={busy}
          >
            {busy ? 'Joining…' : 'Join the call'}
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: '0.8rem' }}>
            Your browser will ask for camera and microphone access.
          </p>
          {error && (
            <p className="error-text" style={{ marginTop: '1rem' }}>
              {error === 'session_not_active'
                ? 'This call has ended.'
                : error.includes('expired') || error.includes('invalid')
                  ? 'This invite link has expired or is invalid.'
                  : error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
