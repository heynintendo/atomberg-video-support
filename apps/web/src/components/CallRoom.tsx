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
  isAgent?: boolean;
  onLeave: () => void;
}

// `?relay=1` forces the browser to gather only TURN relay candidates, which
// pins media to the server's TURN/TLS path on 5349 — the same path a venue
// network that blocks UDP would force.
function isRelayForced(): boolean {
  const value = new URLSearchParams(window.location.search).get('relay');
  return value === '1' || value === 'true';
}

export function CallRoom({ connection, isAgent = false, onLeave }: Props) {
  const forceRelay = isRelayForced();
  return (
    <LiveKitRoom
      serverUrl={connection.url}
      token={connection.token}
      connect
      audio
      video
      connectOptions={forceRelay ? { rtcConfig: { iceTransportPolicy: 'relay' } } : undefined}
      onDisconnected={onLeave}
      onError={(err) => {
        console.error('LiveKit connection error', err);
      }}
      style={{ height: '100vh' }}
    >
      {forceRelay && (
        <div
          style={{
            background: '#7c2d12',
            color: '#fed7aa',
            padding: '0.4rem 1rem',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
          }}
        >
          Relay-only mode: media is forced through the server TURN/TLS path (5349).
        </div>
      )}
      <CallStage room={connection.room} identity={connection.identity} isAgent={isAgent} onLeave={onLeave} />
      {/* Plays every subscribed remote audio track. */}
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function CallStage({
  room,
  identity,
  isAgent,
  onLeave,
}: {
  room: string;
  identity: string;
  isAgent: boolean;
  onLeave: () => void;
}) {
  const state = useConnectionState();
  const participants = useParticipants();
  // Camera tracks for every participant (local included) so each tab sees itself
  // and everyone else. Media for remote tiles is delivered by the SFU.
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  // Server-stats view is an agent-only tool (the endpoint is agent-only).
  const [showStats, setShowStats] = useState(isAgent);

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
          {isAgent && (
            <button onClick={() => setShowStats((s) => !s)}>
              {showStats ? 'Hide' : 'Show'} server stats
            </button>
          )}
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

      {isAgent && showStats && <ServerStatsPanel room={room} />}
    </div>
  );
}
