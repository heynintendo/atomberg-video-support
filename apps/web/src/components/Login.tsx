import { useEffect, useState } from 'react';
import type { AgentCard, AuthUser } from '@atomquest/shared';
import { fetchAgents, demoLogin } from '../lib/api';

export function Login({ onLoggedIn }: { onLoggedIn: (user: AuthUser) => void }) {
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [entraEnabled, setEntraEnabled] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>AtomQuest Support</h1>
        <p style={styles.subtitle}>Agent sign-in</p>

        <p style={styles.section}>Continue instantly as a demo agent</p>
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {agents.map((a) => (
            <button
              key={a.email}
              onClick={() => void signIn(a.email)}
              disabled={busyEmail !== null}
              style={styles.agentCard}
            >
              <span style={styles.avatar}>{a.name.charAt(0)}</span>
              <span style={{ textAlign: 'left', flex: 1 }}>
                <span style={styles.agentName}>{a.name}</span>
                <span style={styles.agentEmail}>{a.email}</span>
              </span>
              <span style={styles.demoBadge}>DEMO</span>
              <span style={{ opacity: 0.6 }}>{busyEmail === a.email ? '…' : '→'}</span>
            </button>
          ))}
          {agents.length === 0 && !error && <p style={{ opacity: 0.6 }}>Loading…</p>}
        </div>

        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>OR</span>
          <span style={styles.dividerLine} />
        </div>

        <button onClick={microsoft} style={styles.msButton}>
          <span style={{ fontWeight: 600 }}>Sign in with Microsoft</span>
        </button>
        <p style={styles.msNote}>
          Microsoft sign-in is real Entra (Azure AD) OAuth{entraEnabled ? '.' : ' — being set up.'}
        </p>
        {ssoNote && (
          <p style={{ ...styles.msNote, color: '#b45309' }}>
            Entra SSO isn&apos;t wired yet. Use a demo agent above for now.
          </p>
        )}

        {error && <p style={{ color: 'crimson', marginTop: '1rem' }}>{error}</p>}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: '#f4f4f5',
    fontFamily: 'system-ui, sans-serif',
    padding: '1rem',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: '#fff',
    borderRadius: 16,
    padding: '2rem',
    boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
  },
  title: { margin: 0, fontSize: '1.5rem' },
  subtitle: { margin: '0.25rem 0 1.5rem', color: '#71717a' },
  section: { fontSize: 13, color: '#52525b', margin: '0 0 0.5rem', fontWeight: 600 },
  agentCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    border: '1px solid #e4e4e7',
    borderRadius: 12,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 14,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#6366f1',
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 700,
  },
  agentName: { display: 'block', fontWeight: 600, color: '#18181b' },
  agentEmail: { display: 'block', fontSize: 12, color: '#a1a1aa' },
  demoBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: '#3730a3',
    background: '#e0e7ff',
    borderRadius: 6,
    padding: '2px 6px',
    letterSpacing: '0.05em',
  },
  divider: { display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.5rem 0' },
  dividerLine: { flex: 1, height: 1, background: '#e4e4e7' },
  dividerText: { fontSize: 12, color: '#a1a1aa', fontWeight: 600 },
  msButton: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #d4d4d8',
    borderRadius: 12,
    background: '#fff',
    cursor: 'pointer',
  },
  msNote: { fontSize: 12, color: '#a1a1aa', marginTop: '0.5rem', textAlign: 'center' },
};
