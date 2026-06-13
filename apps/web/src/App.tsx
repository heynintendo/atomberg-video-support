import { useEffect, useState } from 'react';
import type { AuthUser, JoinTokenResponse } from '@atomquest/shared';
import { fetchMe } from './lib/api';
import { Login } from './components/Login';
import { AgentConsole } from './components/AgentConsole';
import { CustomerJoin } from './components/CustomerJoin';
import { CallRoom } from './components/CallRoom';

type Mode = 'loading' | 'login' | 'console' | 'customer';

const inviteToken = new URLSearchParams(window.location.search).get('invite');

export function App() {
  const [mode, setMode] = useState<Mode>('loading');
  const [agent, setAgent] = useState<AuthUser | null>(null);
  const [connection, setConnection] = useState<JoinTokenResponse | null>(null);

  useEffect(() => {
    // Customers arrive via the invite link; agents go through the console.
    if (inviteToken) {
      setMode('customer');
      return;
    }
    fetchMe()
      .then((r) => {
        if (r.user && r.user.role === 'agent') {
          setAgent(r.user);
          setMode('console');
        } else {
          setMode('login');
        }
      })
      .catch(() => setMode('login'));
  }, []);

  if (connection) {
    const isAgent = connection.identity.startsWith('agent-');
    return <CallRoom connection={connection} isAgent={isAgent} onLeave={() => setConnection(null)} />;
  }

  if (mode === 'customer' && inviteToken) {
    return <CustomerJoin invite={inviteToken} onJoin={setConnection} />;
  }
  if (mode === 'console' && agent) {
    return (
      <AgentConsole
        agent={agent}
        onJoin={setConnection}
        onLogout={() => {
          setAgent(null);
          setMode('login');
        }}
      />
    );
  }
  if (mode === 'login') {
    return (
      <Login
        onLoggedIn={(user) => {
          setAgent(user);
          setMode('console');
        }}
      />
    );
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif', color: '#71717a' }}>
      Loading...
    </main>
  );
}
