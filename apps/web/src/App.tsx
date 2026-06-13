import { useEffect, useState } from 'react';
import type { AuthUser, JoinTokenResponse } from '@atomquest/shared';
import { fetchMe } from './lib/api';
import { Landing } from './components/Landing';
import { RoleChooser } from './components/RoleChooser';
import { Login } from './components/Login';
import { AgentConsole } from './components/AgentConsole';
import { CustomerInviteEntry } from './components/CustomerInviteEntry';
import { CustomerJoin } from './components/CustomerJoin';
import { CallRoom } from './components/CallRoom';
import { LogoAssembly } from './components/LogoAssembly';

type View = 'landing' | 'chooser' | 'login' | 'console' | 'customer-entry' | 'customer-join';

const inviteToken = new URLSearchParams(window.location.search).get('invite');
const BEAT_KEY = 'aq_beat_seen';

export function App() {
  const [view, setView] = useState<View>(inviteToken ? 'customer-join' : 'landing');
  const [agent, setAgent] = useState<AuthUser | null>(null);
  const [connection, setConnection] = useState<JoinTokenResponse | null>(null);
  // Brand beat only on a fresh first landing (never on a deep-link invite).
  const [beat, setBeat] = useState<boolean>(() => !inviteToken && !sessionStorage.getItem(BEAT_KEY));

  useEffect(() => {
    if (inviteToken) return;
    fetchMe()
      .then((r) => {
        if (r.user && r.user.role === 'agent') setAgent(r.user);
      })
      .catch(() => {});
  }, []);

  const dismissBeat = () => {
    sessionStorage.setItem(BEAT_KEY, '1');
    setBeat(false);
  };
  const goHome = () => setView('landing');
  const goAgent = () => setView(agent ? 'console' : 'login');

  // A live call takes over the whole screen.
  if (connection) {
    const isAgent = connection.identity.startsWith('agent-');
    return <CallRoom connection={connection} isAgent={isAgent} onLeave={() => setConnection(null)} />;
  }

  return (
    <>
      {beat && <LogoAssembly onDone={dismissBeat} onSkip={dismissBeat} />}

      {view === 'customer-join' && inviteToken && (
        <CustomerJoin invite={inviteToken} onJoin={setConnection} />
      )}
      {view === 'landing' && <Landing onStart={() => setView('chooser')} onAgent={goAgent} />}
      {view === 'chooser' && (
        <RoleChooser onAgent={goAgent} onCustomer={() => setView('customer-entry')} onHome={goHome} />
      )}
      {view === 'login' && (
        <Login
          onLoggedIn={(user) => {
            setAgent(user);
            setView('console');
          }}
          onHome={goHome}
        />
      )}
      {view === 'console' && agent && (
        <AgentConsole
          agent={agent}
          onJoin={setConnection}
          onLogout={() => {
            setAgent(null);
            setView('landing');
          }}
          onHome={goHome}
        />
      )}
      {view === 'customer-entry' && (
        <CustomerInviteEntry onJoined={setConnection} onHome={goHome} />
      )}
      {/* Fallback: if console was requested without an agent yet, show login. */}
      {view === 'console' && !agent && (
        <Login
          onLoggedIn={(user) => {
            setAgent(user);
            setView('console');
          }}
          onHome={goHome}
        />
      )}
    </>
  );
}
