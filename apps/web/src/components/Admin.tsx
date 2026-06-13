import { useCallback, useEffect, useState } from 'react';
import type {
  AdminMetrics,
  AdminRecordingEntry,
  AdminSessionSummary,
  AuthUser,
} from '@atomquest/shared';
import {
  adminEndSession,
  fetchAdminMetrics,
  fetchAdminRecordings,
  fetchAdminSessions,
  logout,
  recordingFileUrl,
} from '../lib/api';
import { Header } from './Header';

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtBytes(bytes: number): string {
  if (!bytes) return '0';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const COUNTER_LABELS: Array<[string, string]> = [
  ['requests.total', 'Total requests'],
  ['errors.4xx', '4xx errors'],
  ['errors.5xx', '5xx errors'],
  ['egress.failures', 'Egress failures'],
  ['files.uploaded', 'Files uploaded'],
  ['files.rejected', 'Files rejected'],
];

export function Admin({
  agent,
  onHome,
  onSignedOut,
}: {
  agent: AuthUser;
  onHome: () => void;
  onSignedOut: () => void;
}) {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [sessions, setSessions] = useState<AdminSessionSummary[]>([]);
  const [recordings, setRecordings] = useState<AdminRecordingEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, s, r] = await Promise.all([
        fetchAdminMetrics(),
        fetchAdminSessions(),
        fetchAdminRecordings(),
      ]);
      setMetrics(m);
      setSessions(s.sessions);
      setRecordings(r.recordings);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  const end = async (id: string) => {
    try {
      await adminEndSession(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not end session');
    }
  };

  const doLogout = async () => {
    await logout().catch(() => {});
    onSignedOut();
  };

  const gauges = metrics?.gauges;

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
      <div className="aq-container" style={{ padding: '2rem 1.25rem 4rem', display: 'grid', gap: '1.6rem', maxWidth: 980 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Admin dashboard</h1>
          <p className="muted" style={{ margin: '0.3rem 0 0' }}>Cross-session operations, observability, and recordings.</p>
        </div>

        {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}

        {/* Live gauges */}
        <div className="aq-metrics">
          <div className="aq-metric"><span className="n">{gauges?.activeSessions ?? '–'}</span><span className="l">Active sessions</span></div>
          <div className="aq-metric"><span className="n">{gauges?.activeParticipants ?? '–'}</span><span className="l">Live participants</span></div>
          <div className="aq-metric"><span className="n">{gauges?.recordingsCount ?? '–'}</span><span className="l">Recordings</span></div>
          <div className="aq-metric"><span className="n">{gauges ? fmtBytes(gauges.recordingsTotalBytes) : '–'}</span><span className="l">Recording storage</span></div>
        </div>

        {/* Counters */}
        <div className="card card-pad">
          <p style={{ margin: '0 0 0.7rem', fontWeight: 600, fontFamily: 'var(--font-head)' }}>Observability counters</p>
          <div className="aq-counters">
            {COUNTER_LABELS.map(([key, label]) => (
              <div key={key} className="aq-counter">
                <span className="l">{label}</span>
                <span className="n">{metrics?.counters[key] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sessions */}
        <div>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.7rem' }}>All sessions</h2>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="aq-table">
              <thead>
                <tr>
                  <th>Room</th><th>Status</th><th>Agent</th><th>Participants</th><th>Duration</th><th>Recordings</th><th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td><code style={{ fontSize: 12 }}>{s.roomName}</code></td>
                    <td>
                      <span className={s.status === 'active' ? 'pill pill-live' : 'pill pill-ended'}>
                        {s.status === 'active' && <span className="dot" />}{s.status}
                      </span>
                    </td>
                    <td>{s.agentName}</td>
                    <td>{s.participantCount}</td>
                    <td>{fmtDuration(s.durationSeconds)}</td>
                    <td>{s.recordingCount}</td>
                    <td>
                      {s.status === 'active' && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => void end(s.id)}>End</button>
                      )}
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr><td colSpan={7} className="muted" style={{ padding: '0.8rem' }}>No sessions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recordings */}
        <div>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.7rem' }}>All recordings</h2>
          {recordings.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No recordings yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.9rem' }}>
              {recordings.map((r) => (
                <li key={r.id} className="card card-pad aq-rec-item">
                  <div className="aq-rec-row">
                    <code style={{ fontSize: 12 }}>{r.roomName}</code>
                    <span className={`pill ${r.status === 'ready' ? 'pill-live' : 'pill-ended'}`}>
                      {r.status === 'ready' && <span className="dot" />}{r.status === 'ready' ? 'ready' : r.status}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {new Date(r.createdAt).toLocaleString()}
                      {r.durationSeconds != null && ` · ${fmtDuration(r.durationSeconds)}`}
                      {r.sizeBytes != null && ` · ${fmtBytes(r.sizeBytes)}`}
                    </span>
                  </div>
                  {r.status === 'ready' && (
                    <>
                      <video className="aq-rec-video" controls preload="metadata" src={recordingFileUrl(r.id)} />
                      <a className="btn btn-ghost btn-sm" href={recordingFileUrl(r.id)} download>Download MP4</a>
                    </>
                  )}
                  {r.status === 'failed' && (
                    <p className="error-text" style={{ margin: 0, fontSize: 12 }}>{r.error ?? 'Recording failed.'}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
