import { useState } from 'react';
import type { JoinTokenResponse } from '@atomquest/shared';
import { JoinForm } from './components/JoinForm';
import { CallRoom } from './components/CallRoom';

export function App() {
  const [connection, setConnection] = useState<JoinTokenResponse | null>(null);

  if (connection) {
    return <CallRoom connection={connection} onLeave={() => setConnection(null)} />;
  }

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 640,
        margin: '0 auto',
        padding: '2rem',
      }}
    >
      <h1>AtomQuest Support</h1>
      <p>
        Join a room to start a live audio/video call. Media is relayed through our
        self-hosted LiveKit SFU; there is no client-to-client connection.
      </p>
      <JoinForm onJoined={setConnection} />
    </main>
  );
}
