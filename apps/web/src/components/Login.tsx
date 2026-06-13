import { useEffect, useState } from 'react';
import type { AgentCard, AuthUser } from '@atomquest/shared';
import { fetchAgents, demoLogin } from '../lib/api';
import { Header } from './Header';

function MicrosoftMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

export function Login({ onLoggedIn, onHome }: { onLoggedIn: (user: AuthUser) => void; onHome: () => void }) {
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [entraEnabled, setEntraEnabled] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    new URLSearchParams(window.location.search).get('sso_error')
      ? 'Microsoft sign-in did not complete. Please try again or use a demo agent.'
      : null,
  );
  const [ssoNote, setSsoNote] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAgents()
      .then((r) => {
        if (active) {
          setAgents(r.agents);
          setEntraEnabled(r.entraEnabled);
        }
      })
      .catch(() => {
        if (active) setError('Could not load sign-in options.');
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = async (email: string) => {
    setBusyEmail(email);
    setError(null);
    try {
      const { user } = await demoLogin(email);
      onLoggedIn(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'sign-in failed');
    } finally {
      setBusyEmail(null);
    }
  };

  const microsoft = () => {
    if (entraEnabled) {
      window.location.href = '/api/auth/entra/login';
    } else {
      setSsoNote(true);
    }
  };

  return (
    <div className="aq-app">
      <Header onHome={onHome} />
      <div className="aq-center">
        <div className="card card-pad rise" style={{ width: '100%', maxWidth: 420 }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Agent sign-in</h2>
          <p className="muted" style={{ margin: '0.3rem 0 1.3rem' }}>
            Continue instantly as a demo agent — no password needed.
          </p>

          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {agents.map((a) => (
              <button
                key={a.email}
                type="button"
                className="aq-agent-card"
                onClick={() => void signIn(a.email)}
                disabled={busyEmail !== null}
              >
                <span className="aq-avatar">{a.name.charAt(0)}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <strong style={{ display: 'block', fontFamily: 'var(--font-head)' }}>{a.name}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>{a.email}</span>
                </span>
                <span className="pill pill-demo">DEMO</span>
                <span className="muted">{busyEmail === a.email ? '…' : '→'}</span>
              </button>
            ))}
            {agents.length === 0 && !error && <p className="muted">Loading…</p>}
          </div>

          <div className="or-divider">
            <span>OR</span>
          </div>

          <button type="button" className="btn btn-ghost btn-block" onClick={microsoft}>
            <MicrosoftMark />
            Sign in with Microsoft
          </button>
          <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: '0.6rem' }}>
            Microsoft sign-in is real Entra (Azure AD) OAuth{entraEnabled ? '.' : ' — being set up.'}
          </p>
          {ssoNote && (
            <p style={{ fontSize: 12, textAlign: 'center', color: '#8a5a00' }}>
              Entra SSO isn&apos;t wired yet. Use a demo agent above for now.
            </p>
          )}
          {error && <p className="error-text" style={{ marginTop: '1rem', textAlign: 'center' }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
