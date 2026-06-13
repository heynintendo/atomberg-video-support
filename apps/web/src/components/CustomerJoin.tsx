import { useState } from 'react';
import type { JoinTokenResponse } from '@atomquest/shared';
import { joinWithInvite } from '../lib/api';

interface Props {
  invite: string;
  onJoin: (connection: JoinTokenResponse) => void;
}

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
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>AtomQuest Support</h1>
        <p style={styles.text}>You&apos;ve been invited to a live support call.</p>
        <button onClick={() => void join()} disabled={busy} style={styles.joinBtn}>
          {busy ? 'Joining…' : 'Join the call'}
        </button>
        <p style={styles.hint}>Your browser will ask for camera and microphone access.</p>
        {error && (
          <p style={{ color: 'crimson', marginTop: '1rem' }}>
            {error === 'session_not_active'
              ? 'This call has ended.'
              : error === 'invite_expired' || error === 'invalid_or_expired_invite'
                ? 'This invite link has expired or is invalid.'
                : error}
          </p>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f4f5', fontFamily: 'system-ui, sans-serif', padding: '1rem' },
  card: { width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, padding: '2rem', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', textAlign: 'center' },
  title: { margin: 0, fontSize: '1.4rem' },
  text: { color: '#52525b', margin: '0.75rem 0 1.5rem' },
  joinBtn: { width: '100%', padding: '0.85rem', border: 'none', borderRadius: 12, background: '#4f46e5', color: '#fff', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' },
  hint: { fontSize: 12, color: '#a1a1aa', marginTop: '0.75rem' },
};
