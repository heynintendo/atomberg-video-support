import { type FormEvent, useState } from 'react';
import type { JoinTokenResponse, ParticipantRole } from '@atomquest/shared';
import { fetchJoinToken } from '../lib/api';

export function JoinForm({ onJoined }: { onJoined: (connection: JoinTokenResponse) => void }) {
  const [room, setRoom] = useState('demo-room');
  const [name, setName] = useState('');
  const [role, setRole] = useState<ParticipantRole>('agent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const trimmedName = name.trim();
      const suffix = Math.random().toString(36).slice(2, 7);
      const identity = `${(trimmedName || role).toLowerCase().replace(/\s+/g, '-')}-${suffix}`;
      const connection = await fetchJoinToken({
        room: room.trim(),
        identity,
        name: trimmedName || identity,
        role,
      });
      onJoined(connection);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to join');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 360 }}>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Room</span>
        <input value={room} onChange={(e) => setRoom(e.target.value)} required />
      </label>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Display name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="optional" />
      </label>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as ParticipantRole)}>
          <option value="agent">Agent</option>
          <option value="customer">Customer</option>
        </select>
      </label>
      <button type="submit" disabled={busy || room.trim().length === 0}>
        {busy ? 'Connecting...' : 'Join call'}
      </button>
      {error && <p style={{ color: 'crimson', margin: 0 }}>{error}</p>}
    </form>
  );
}
