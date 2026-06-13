import { useCallback, useEffect, useState } from 'react';
import type { AuthUser, JoinTokenResponse, SessionSummary } from '@atomquest/shared';
import { createSession, listSessions, getAgentToken, endSession, logout } from '../lib/api';

interface Props {
  agent: AuthUser;
  onJoin: (connection: JoinTokenResponse) => void;
  onLogout: () => void;
}

export function AgentConsole({ agent, onJoin, onLogout }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [invite, setInvite] = useState<{ sessionId: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not end session');
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
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Agent console</h1>
            <span style={styles.who}>
              Signed in as <strong>{agent.name}</strong>
            </span>
          </div>
          <button onClick={() => void doLogout()} style={styles.ghostBtn}>
            Sign out
          </button>
        </header>

        <button onClick={() => void create()} disabled={busy} style={styles.primaryBtn}>
          {busy ? 'Creating…' : 'New support session'}
        </button>

        {invite && (
          <div style={styles.invite}>
            <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>Share this invite with the customer</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input readOnly value={invite.url} style={styles.inviteInput} />
              <button onClick={copy} style={styles.secondaryBtn}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button onClick={() => void join(invite.sessionId)} style={{ ...styles.primaryBtn, marginTop: '0.75rem' }}>
              Join this call as agent
            </button>
          </div>
        )}

        {error && <p style={{ color: 'crimson' }}>{error}</p>}

        <h2 style={styles.h2}>Your sessions</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
          {sessions.map((s) => (
            <li key={s.id} style={styles.sessionRow}>
              <span style={{ flex: 1 }}>
                <code style={{ fontSize: 13 }}>{s.roomName}</code>{' '}
                <span style={{ ...styles.statusPill, background: s.status === 'active' ? '#dcfce7' : '#f4f4f5', color: s.status === 'active' ? '#166534' : '#71717a' }}>
                  {s.status}
                </span>
              </span>
              {s.status === 'active' && (
                <>
                  <button onClick={() => void join(s.id)} style={styles.secondaryBtn}>
                    Join
                  </button>
                  <button onClick={() => void end(s.id)} style={styles.dangerBtn}>
                    End
                  </button>
                </>
              )}
            </li>
          ))}
          {sessions.length === 0 && <li style={{ color: '#a1a1aa' }}>No sessions yet.</li>}
        </ul>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f4f5', fontFamily: 'system-ui, sans-serif', padding: '2rem 1rem' },
  container: { maxWidth: 640, margin: '0 auto', display: 'grid', gap: '1.25rem' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { margin: 0, fontSize: '1.4rem' },
  who: { color: '#71717a', fontSize: 14 },
  h2: { fontSize: '1rem', margin: '0.5rem 0 0' },
  primaryBtn: { padding: '0.7rem 1rem', border: 'none', borderRadius: 10, background: '#4f46e5', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  secondaryBtn: { padding: '0.5rem 0.9rem', border: '1px solid #d4d4d8', borderRadius: 8, background: '#fff', cursor: 'pointer' },
  dangerBtn: { padding: '0.5rem 0.9rem', border: '1px solid #fecaca', borderRadius: 8, background: '#fff', color: '#b91c1c', cursor: 'pointer' },
  ghostBtn: { padding: '0.4rem 0.8rem', border: 'none', background: 'transparent', color: '#71717a', cursor: 'pointer' },
  invite: { background: '#fff', borderRadius: 12, padding: '1rem', border: '1px solid #e4e4e7' },
  inviteInput: { flex: 1, padding: '0.5rem', border: '1px solid #e4e4e7', borderRadius: 8, fontSize: 13 },
  sessionRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', borderRadius: 10, padding: '0.6rem 0.9rem', border: '1px solid #e4e4e7' },
  statusPill: { fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '2px 6px' },
};
