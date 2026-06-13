import { useEffect, useState } from 'react';
import type { RoomParticipantsView } from '@atomquest/shared';
import { fetchRoomParticipants } from '../lib/api';

/**
 * Polls the backend's authoritative RoomService view. This is the server's own
 * account of who is publishing what, independent of anything the browser reports,
 * and demonstrates that media is routed through the SFU.
 */
export function ServerStatsPanel({ room }: { room: string }) {
  const [view, setView] = useState<RoomParticipantsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const next = await fetchRoomParticipants(room);
        if (active) {
          setView(next);
          setError(null);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'failed');
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [room]);

  return (
    <aside
      style={{
        background: '#0b0b0f',
        color: '#e4e4e7',
        padding: '0.75rem 1rem',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 13,
        borderTop: '1px solid #27272a',
      }}
    >
      <strong>Server view — LiveKit RoomService</strong>
      {error && <span style={{ color: '#f87171', marginLeft: 8 }}>{error}</span>}
      {view ? (
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
          {view.participants.map((p) => (
            <li key={p.sid}>
              <strong>{p.identity}</strong> [{p.state}] up:{' '}
              {p.publishedTracks.map((t) => `${t.source}/${t.kind}`).join(', ') || 'none'}
            </li>
          ))}
          {view.participants.length === 0 && <li>no participants yet</li>}
        </ul>
      ) : (
        <span style={{ marginLeft: 8 }}>loading...</span>
      )}
    </aside>
  );
}
