import { useCallback, useEffect, useState } from 'react';
import type { AuthUser, JoinTokenResponse, SessionDetail, SessionSummary } from '@atomquest/shared';
import { createSession, listSessions, getAgentToken, endSession, getSessionDetail, logout } from '../lib/api';
import { Header } from './Header';

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface Props {
  agent: AuthUser;
  onJoin: (connection: JoinTokenResponse) => void;
  onLogout: () => void;
  onHome: () => void;
}

export function AgentConsole({ agent, onJoin, onLogout, onHome }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [invite, setInvite] = useState<{ sessionId: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  const refresh = useCallback(() => {
    listSessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await createSession();
      setInvite({ sessionId: r.session.id, url: r.inviteUrl });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not create session');
    } finally {
      setBusy(false);
    }
  };

  const join = async (sessionId: string) => {
    setError(null);
    try {
      onJoin(await getAgentToken(sessionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not join');
    }
  };

  const end = async (sessionId: string) => {
    setError(null);
    try {
      await endSession(sessionId);
      if (invite?.sessionId === sessionId) setInvite(null);
      if (detail?.session.id === sessionId) setDetail(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not end session');
    }
  };

  const viewHistory = async (sessionId: string) => {
    if (detail?.session.id === sessionId) {
      setDetail(null);
      return;
    }
    try {
      setDetail(await getSessionDetail(sessionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not load history');
    }
  };

  const copy = () => {
    if (!invite) return;
    void navigator.clipboard.writeText(invite.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const doLogout = async () => {
    await logout().catch(() => {});
    onLogout();
  };

  return (
    <div className="aq-app">
      <Header
        onHome={onHome}
        right={
          <>
            <span className="muted">
              <span style={{ color: 'var(--ink)', fontWeight: 600, fontFamily: 'var(--font-head)' }}>{agent.name}</span>
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void doLogout()}>
              Sign out
            </button>
          </>
        }
      />
      <div className="aq-container" style={{ padding: '2rem 1.25rem 4rem', display: 'grid', gap: '1.5rem', maxWidth: 760 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Support console</h1>
          <p className="muted" style={{ margin: '0.3rem 0 0' }}>Start a session and share the invite with your customer.</p>
        </div>

        <button type="button" className="btn btn-primary btn-lg" style={{ justifySelf: 'start' }} onClick={() => void create()} disabled={busy}>
          {busy ? 'Creating…' : '＋ New support session'}
        </button>

        {invite && (
          <div className="card card-pad rise">
            <p style={{ margin: '0 0 0.6rem', fontWeight: 600, fontFamily: 'var(--font-head)' }}>Share this invite with your customer</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input className="input" readOnly value={invite.url} style={{ flex: 1, minWidth: 220 }} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-ghost" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
            </div>
            <button type="button" className="btn btn-dark btn-block" style={{ marginTop: '0.8rem' }} onClick={() => void join(invite.sessionId)}>
              Join this call as agent
            </button>
          </div>
        )}

        {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}

        <div>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.7rem' }}>Your sessions</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.6rem' }}>
            {sessions.map((s) => (
              <li key={s.id} className="card" style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.8rem 1rem', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 160 }}>
                    <code style={{ fontSize: 13 }}>{s.roomName}</code>{' '}
                    <span className={s.status === 'active' ? 'pill pill-live' : 'pill pill-ended'}>
                      {s.status === 'active' && <span className="dot" />}
                      {s.status}
                    </span>
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void viewHistory(s.id)}>
                    {detail?.session.id === s.id ? 'Hide' : 'History'}
                  </button>
                  {s.status === 'active' && (
                    <>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void join(s.id)}>Join</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => void end(s.id)}>End</button>
                    </>
                  )}
                </div>
                {detail?.session.id === s.id && (
                  <div style={{ borderTop: '1px solid var(--line)', padding: '0.5rem 1rem 0.9rem' }}>
                    {detail.participants.length === 0 ? (
                      <p className="muted" style={{ margin: '0.6rem 0' }}>No participants recorded yet.</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                            <th style={{ padding: '0.4rem 0', fontWeight: 600 }}>Participant</th>
                            <th style={{ padding: '0.4rem 0', fontWeight: 600 }}>Role</th>
                            <th style={{ padding: '0.4rem 0', fontWeight: 600 }}>Joined</th>
                            <th style={{ padding: '0.4rem 0', fontWeight: 600 }}>Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.participants.map((p, i) => (
                            <tr key={`${p.identity}-${i}`} style={{ borderTop: '1px solid var(--surface-2)' }}>
                              <td style={{ padding: '0.4rem 0' }}><code>{p.identity}</code></td>
                              <td style={{ padding: '0.4rem 0' }}>{p.role}</td>
                              <td style={{ padding: '0.4rem 0' }}>{new Date(p.joinedAt).toLocaleTimeString()}</td>
                              <td style={{ padding: '0.4rem 0' }}>
                                {p.leftAt ? fmtDuration(p.durationSeconds) : `in call (${fmtDuration(p.durationSeconds)})`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </li>
            ))}
            {sessions.length === 0 && <li className="muted">No sessions yet — create one to get started.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
