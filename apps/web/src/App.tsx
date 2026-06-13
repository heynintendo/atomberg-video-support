import { useCallback, useEffect, useState } from 'react';
import type { AuthUser, JoinTokenResponse } from '@atomquest/shared';
import { fetchMe, getAgentToken, joinWithInvite } from './lib/api';
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
  // The invite a customer joined with, kept so a dropped customer can rejoin via
  // the same reconnect-mapped invite (same identity, never a duplicate).
  const [customerInvite, setCustomerInvite] = useState<string | null>(inviteToken);
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

  // Re-obtain a fresh token for the SAME identity after an unrecoverable drop:
  // the agent re-enters via the session token, the customer via their invite.
  // The deterministic server-side identity maps both back to their existing
  // participant — never a duplicate. A fresh token changes CallRoom's key, which
  // remounts it for a clean reconnect.
  const rejoin = useCallback(async () => {
    if (!connection) return;
    if (connection.identity.startsWith('agent-')) {
      if (!connection.sessionId) throw new Error('no_session');
      setConnection(await getAgentToken(connection.sessionId));
    } else {
      setConnection(await joinWithInvite(customerInvite ?? ''));
    }
  }, [connection, customerInvite]);

  // A live call takes over the whole screen.
  if (connection) {
    const isAgent = connection.identity.startsWith('agent-');
    return (
      <CallRoom
        key={connection.token}
        connection={connection}
        isAgent={isAgent}
        onLeave={() => setConnection(null)}
        onRejoin={rejoin}
      />
    );
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
        <CustomerInviteEntry
          onJoined={(c, inv) => {
            setCustomerInvite(inv);
            setConnection(c);
          }}
          onHome={goHome}
        />
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
