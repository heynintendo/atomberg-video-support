import { useState } from 'react';
import {
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useConnectionState,
  useParticipants,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import type { JoinTokenResponse } from '@atomquest/shared';
import { ServerStatsPanel } from './ServerStatsPanel';

interface Props {
  connection: JoinTokenResponse;
  onLeave: () => void;
}

export function CallRoom({ connection, onLeave }: Props) {
  return (
    <LiveKitRoom
      serverUrl={connection.url}
      token={connection.token}
      connect
      audio
      video
      onDisconnected={onLeave}
      onError={(err) => {
        console.error('LiveKit connection error', err);
      }}
      style={{ height: '100vh' }}
    >
      <CallStage room={connection.room} identity={connection.identity} onLeave={onLeave} />
      {/* Plays every subscribed remote audio track. */}
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function CallStage({
  room,
  identity,
  onLeave,
}: {
  room: string;
  identity: string;
  onLeave: () => void;
}) {
  const state = useConnectionState();
  const participants = useParticipants();
  // Camera tracks for every participant (local included) so each tab sees itself
  // and everyone else. Media for remote tiles is delivered by the SFU.
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const [showStats, setShowStats] = useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#18181b' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.6rem 1rem',
          color: '#e4e4e7',
          fontFamily: 'system-ui, sans-serif',
          background: '#0b0b0f',
        }}
      >
        <div>
          Room <strong>{room}</strong> · you are <strong>{identity}</strong> ·{' '}
          <span style={{ opacity: 0.8 }}>{state}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ opacity: 0.8 }}>{participants.length} in room</span>
          <button onClick={() => setShowStats((s) => !s)}>
            {showStats ? 'Hide' : 'Show'} server stats
          </button>
          <button onClick={onLeave}>Leave</button>
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0 }}>
        {cameraTracks.length > 0 ? (
          <GridLayout tracks={cameraTracks} style={{ height: '100%' }}>
            <ParticipantTile />
          </GridLayout>
        ) : (
          <p style={{ color: '#a1a1aa', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
            Waiting for camera. Allow camera and microphone access to publish your tracks.
          </p>
        )}
      </main>

      {showStats && <ServerStatsPanel room={room} />}
    </div>
  );
}
