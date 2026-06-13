import { useEffect, useState } from 'react';
import type { HealthResponse } from '@atomquest/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/health`)
      .then((res) => res.json() as Promise<HealthResponse>)
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'request failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '0 auto', padding: '2rem' }}>
      <h1>AtomQuest Support</h1>
      <p>Real-time video support platform. Phase 0 foundation.</p>
      <section>
        <h2>API status</h2>
        {health ? (
          <pre style={{ background: '#f4f4f5', padding: '1rem', borderRadius: 8 }}>
            {JSON.stringify(health, null, 2)}
          </pre>
        ) : error ? (
          <p style={{ color: 'crimson' }}>API unreachable: {error}</p>
        ) : (
          <p>Checking API connection...</p>
        )}
      </section>
    </main>
  );
}
