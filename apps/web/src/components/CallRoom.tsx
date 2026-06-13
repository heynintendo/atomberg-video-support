import { useEffect, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from '@livekit/components-react';
import type { TrackReference, TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import type { Participant } from 'livekit-client';
import '@livekit/components-styles';
import type { JoinTokenResponse } from '@atomquest/shared';
import { endSession } from '../lib/api';
import { useMediaPreflight } from '../hooks/useMediaPreflight';
import { MediaError } from './MediaError';
import { LogoAssembly } from './LogoAssembly';

interface Props {
  connection: JoinTokenResponse;
  isAgent?: boolean;
  onLeave: () => void;
}

function isRelayForced(): boolean {
  const v = new URLSearchParams(window.location.search).get('relay');
  return v === '1' || v === 'true';
}

function displayName(p: Participant): string {
  return p.name && p.name.length > 0 ? p.name : p.identity;
}

function initial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function hasTrack(t: TrackReferenceOrPlaceholder): t is TrackReference {
  return t.publication !== undefined;
}

// --- icons -----------------------------------------------------------------
const ICON = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const MicOn = () => (<svg {...ICON}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
const MicOff = () => (<svg {...ICON}><path d="M9 9v-4a3 3 0 0 1 6 0v4M5 11a7 7 0 0 0 11 5M12 18v3M2 2l20 20" /></svg>);
const CamOn = () => (<svg {...ICON}><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>);
const CamOff = () => (<svg {...ICON}><path d="M16 16H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2m4 0h6a2 2 0 0 1 2 2v3M2 2l20 20M23 7l-7 5" /></svg>);
const Phone = () => (<svg {...ICON}><path d="M21 16.5v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1 3.2 2 2 0 0 1 3 1h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L7 8.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6A2 2 0 0 1 21 16.5z" /></svg>);

export function CallRoom({ connection, isAgent = false, onLeave }: Props) {
  const pre = useMediaPreflight();
  const forceRelay = isRelayForced();

  if (pre.status === 'checking') {
    return <LogoAssembly caption="Setting up your camera and mic…" />;
  }
  if (pre.status !== 'ready') {
    return <MediaError status={pre.status} onRetry={pre.retry} onLeave={onLeave} />;
  }

  return (
    <LiveKitRoom
      serverUrl={connection.url}
      token={connection.token}
      connect
      audio={pre.audio}
      video={pre.video}
      connectOptions={forceRelay ? { rtcConfig: { iceTransportPolicy: 'relay' } } : undefined}
      onDisconnected={onLeave}
      onError={(err) => console.error('LiveKit error', err)}
      style={{ position: 'fixed', inset: 0 }}
    >
      <CallStage
        connection={connection}
        isAgent={isAgent}
        canAudio={pre.audio}
        canVideo={pre.video}
        forceRelay={forceRelay}
        onLeave={onLeave}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function CallStage({
  connection,
  isAgent,
  canAudio,
  canVideo,
  forceRelay,
  onLeave,
}: {
  connection: JoinTokenResponse;
  isAgent: boolean;
  canAudio: boolean;
  canVideo: boolean;
  forceRelay: boolean;
  onLeave: () => void;
}) {
  const connState = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const [minElapsed, setMinElapsed] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 700);
    return () => clearTimeout(t);
  }, []);

  const connecting = connState !== ConnectionState.Connected || !minElapsed;

  const remote = participants.find((p) => !p.isLocal);
  const liveCam = cameraTracks.filter(hasTrack).filter((t) => !t.publication.isMuted);
  const remoteCam = liveCam.find((t) => !t.participant.isLocal);
  const localCam = liveCam.find((t) => t.participant.isLocal);

  const toggleMic = () => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  const toggleCam = () => void localParticipant.setCameraEnabled(!isCameraEnabled);

  const endForAll = async () => {
    if (!connection.sessionId) return;
    setEnding(true);
    try {
      await endSession(connection.sessionId);
    } catch {
      // disconnect regardless
    }
    onLeave();
  };

  return (
    <div className="aq-call">
      {connecting && <LogoAssembly caption="Connecting you to your expert…" />}

      <div className="aq-call-top">
        <span className="aq-brandmark">
          <i aria-hidden="true" />
          atomberg
        </span>
        <div className="aq-call-meta">
          {forceRelay && <span className="aq-chip relay">relay-only</span>}
          <span className="aq-chip">{participants.length} in call</span>
        </div>
      </div>

      <div className="aq-stage">
        <div className="aq-focus">
          {remoteCam ? (
            <VideoTrack trackRef={remoteCam} />
          ) : remote ? (
            <div className="aq-tile-avatar">
              <div className="circle">{initial(displayName(remote))}</div>
              <span className="muted" style={{ color: '#c9c9d0' }}>{displayName(remote)} · camera off</span>
            </div>
          ) : (
            <div className="aq-waiting">
              <span className="pulse" />
              <strong style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem' }}>
                {isAgent ? 'Waiting for the customer to join…' : 'Connecting you with an expert…'}
              </strong>
              <span style={{ fontSize: '0.85rem' }}>
                {isAgent ? 'Share the invite link from your console.' : 'They’ll be with you shortly.'}
              </span>
            </div>
          )}
          {remote && remoteCam && <span className="aq-name-tag">{displayName(remote)}</span>}
        </div>

        <div className={`aq-pip ${localCam ? 'mirror' : ''}`}>
          {localCam ? (
            <VideoTrack trackRef={localCam} />
          ) : (
            <div className="circle">{initial(displayName(localParticipant))}</div>
          )}
          <span className="aq-pip-label">You{!canVideo ? ' · audio only' : ''}</span>
        </div>
      </div>

      <div className="aq-controls">
        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            className={`aq-ctrl ${isMicrophoneEnabled ? '' : 'off'}`}
            onClick={toggleMic}
            disabled={!canAudio}
            aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {isMicrophoneEnabled ? <MicOn /> : <MicOff />}
          </button>
          <span className="aq-ctrl-label">{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            className={`aq-ctrl ${isCameraEnabled ? '' : 'off'}`}
            onClick={toggleCam}
            disabled={!canVideo}
            aria-label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
          >
            {isCameraEnabled ? <CamOn /> : <CamOff />}
          </button>
          <span className="aq-ctrl-label">{isCameraEnabled ? 'Stop video' : 'Start video'}</span>
        </div>

        <button type="button" className="aq-leave leave" onClick={onLeave}>
          <Phone />
          Leave
        </button>
        {isAgent && connection.sessionId && (
          <button type="button" className="aq-leave end" onClick={() => void endForAll()} disabled={ending}>
            {ending ? 'Ending…' : 'End session'}
          </button>
        )}
      </div>
    </div>
  );
}
