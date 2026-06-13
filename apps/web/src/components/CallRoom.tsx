import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useConnectionQualityIndicator,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useRoomInfo,
  useTracks,
} from '@livekit/components-react';
import type { TrackReference, TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { ConnectionQuality, ConnectionState, DisconnectReason, Track } from 'livekit-client';
import type { Participant } from 'livekit-client';
import '@livekit/components-styles';
import type { JoinTokenResponse } from '@atomquest/shared';
import { endSession, startRecording, stopRecording } from '../lib/api';
import { useMediaPreflight } from '../hooks/useMediaPreflight';
import { useChat } from '../hooks/useChat';
import { MediaError } from './MediaError';
import { LogoAssembly } from './LogoAssembly';
import { ChatPanel } from './ChatPanel';

interface Props {
  connection: JoinTokenResponse;
  isAgent?: boolean;
  onLeave: () => void;
  // Re-obtain a fresh connection mapped to the SAME identity (customer via their
  // invite, agent via the session token) and resume. Throws if it can't.
  onRejoin?: () => Promise<void>;
}

function isRelayForced(): boolean {
  const v = new URLSearchParams(window.location.search).get('relay');
  return v === '1' || v === 'true';
}

// A disconnect for any of these reasons means the call is genuinely over (the
// other side ended it, or this client left on purpose) — go home, don't offer a
// rejoin. Everything else (network drops, timeouts, signal close) is treated as
// recoverable and lands on the "connection lost" screen with a Rejoin action.
const TERMINAL_DISCONNECTS = new Set<DisconnectReason>([
  DisconnectReason.CLIENT_INITIATED,
  DisconnectReason.DUPLICATE_IDENTITY,
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.ROOM_DELETED,
  DisconnectReason.ROOM_CLOSED,
  DisconnectReason.USER_REJECTED,
  DisconnectReason.USER_UNAVAILABLE,
]);

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
const ChatIcon = () => (<svg {...ICON}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 20.5l1.5-4.2A8.4 8.4 0 0 1 3.5 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8.5 8.4z" /></svg>);
const RecIcon = ({ active }: { active: boolean }) => (
  <svg {...ICON}><circle cx="12" cy="12" r={active ? 6 : 8} fill={active ? 'currentColor' : 'none'} /></svg>
);

// The room's recording flag is set server-side (RoomService metadata) when egress
// starts/stops, so BOTH participants observe the same consent state.
function parseRecording(metadata: string | undefined): boolean {
  if (!metadata) return false;
  try {
    return (JSON.parse(metadata) as { recording?: unknown }).recording === true;
  } catch {
    return false;
  }
}

export function CallRoom({ connection, isAgent = false, onLeave, onRejoin }: Props) {
  const pre = useMediaPreflight();
  const forceRelay = isRelayForced();
  const [lost, setLost] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [rejoinError, setRejoinError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // LiveKit only fires this after its own reconnection attempts are exhausted, so
  // by the time we get here a recoverable reason means "we genuinely gave up".
  const handleDisconnect = (reason?: DisconnectReason) => {
    if (reason !== undefined && TERMINAL_DISCONNECTS.has(reason)) {
      onLeave();
      return;
    }
    setLost(true);
  };

  const doRejoin = async () => {
    if (!onRejoin) {
      onLeave();
      return;
    }
    setRejoining(true);
    setRejoinError(null);
    try {
      await onRejoin();
      // On success the parent swaps in a fresh connection, which remounts this
      // component cleanly — nothing more to do here.
    } catch {
      if (mounted.current) {
        setRejoining(false);
        setRejoinError('We could not reconnect you. The session may have ended.');
      }
    }
  };

  if (lost) {
    return (
      <ConnectionLost
        canRejoin={!!onRejoin}
        rejoining={rejoining}
        error={rejoinError}
        onRejoin={() => void doRejoin()}
        onLeave={onLeave}
      />
    );
  }

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
      onDisconnected={handleDisconnect}
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

// Unrecoverable-disconnect screen. Never a white page: a clear state plus a way
// back in. Rejoin maps back to the same participant (no duplicate).
function ConnectionLost({
  canRejoin,
  rejoining,
  error,
  onRejoin,
  onLeave,
}: {
  canRejoin: boolean;
  rejoining: boolean;
  error: string | null;
  onRejoin: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="aq-lost">
      <div className="aq-lost-card">
        <div className="aq-lost-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1l22 22M16.7 11.3a5 5 0 0 1 2.5 1.4M5 12.5a10 10 0 0 1 4-2.3M2 8.8a15 15 0 0 1 4.2-2.5M20.5 8.5A15 15 0 0 0 12 5M12 20h.01" />
          </svg>
        </div>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Connection lost</h2>
        <p className="muted" style={{ margin: '0.5rem 0 1.2rem' }}>
          Your connection dropped and we couldn’t reconnect automatically.
        </p>
        {error && <p className="error-text" style={{ marginTop: 0 }}>{error}</p>}
        <div className="aq-lost-actions">
          {canRejoin && (
            <button type="button" className="btn btn-primary btn-lg" onClick={onRejoin} disabled={rejoining}>
              {rejoining ? 'Reconnecting…' : 'Rejoin call'}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

// The remote participant's focus tile. Shows their camera (or an avatar when off),
// and overlays a non-destructive "Reconnecting…" scrim — keeping the last frame —
// when LiveKit reports their connection as lost, instead of blanking abruptly.
function RemoteFocus({ participant, camTrack }: { participant: Participant; camTrack?: TrackReference }) {
  const { quality } = useConnectionQualityIndicator({ participant });
  const reconnecting = quality === ConnectionQuality.Lost;
  return (
    <>
      {camTrack ? (
        <VideoTrack trackRef={camTrack} />
      ) : (
        <div className="aq-tile-avatar">
          <div className="circle">{initial(displayName(participant))}</div>
          <span className="muted" style={{ color: '#c9c9d0' }}>{displayName(participant)} · camera off</span>
        </div>
      )}
      {reconnecting && (
        <div className="aq-reconnect-scrim" role="status">
          <span className="aq-spinner" />
          <span>Reconnecting…</span>
        </div>
      )}
      {camTrack && <span className="aq-name-tag">{displayName(participant)}</span>}
    </>
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
  const roomInfo = useRoomInfo();
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const [minElapsed, setMinElapsed] = useState(false);
  const [ending, setEnding] = useState(false);
  const [everConnected, setEverConnected] = useState(false);
  const recording = useMemo(() => parseRecording(roomInfo.metadata), [roomInfo.metadata]);
  const [recBusy, setRecBusy] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const chat = useChat(connection.sessionId);
  const [chatOpen, setChatOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const baselined = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (connState === ConnectionState.Connected) setEverConnected(true);
  }, [connState]);

  // Treat history present on connect as already seen; only count new arrivals.
  useEffect(() => {
    if (!baselined.current && chat.messages.length > 0) {
      baselined.current = true;
      setSeen(chat.messages.length);
    }
  }, [chat.messages.length]);
  useEffect(() => {
    if (chatOpen) setSeen(chat.messages.length);
  }, [chatOpen, chat.messages.length]);

  // Blocking overlay only for the FIRST connect. Once we've been connected, a
  // transient drop shows a non-blocking banner and keeps the call on screen.
  const initialConnecting = !everConnected && (connState !== ConnectionState.Connected || !minElapsed);
  const reconnecting =
    everConnected &&
    (connState === ConnectionState.Reconnecting || connState === ConnectionState.SignalReconnecting);
  const unread = chatOpen ? 0 : Math.max(0, chat.messages.length - seen);

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

  // Server-side recording start/stop. The button reflects the room recording flag
  // (single source of truth), which flips for both participants on success.
  const toggleRecording = async () => {
    if (!connection.sessionId) return;
    setRecBusy(true);
    setRecError(null);
    try {
      if (recording) await stopRecording(connection.sessionId);
      else await startRecording(connection.sessionId);
    } catch {
      setRecError(recording ? 'Could not stop the recording.' : 'Could not start recording.');
    } finally {
      setRecBusy(false);
    }
  };

  return (
    <div className="aq-call">
      {initialConnecting && <LogoAssembly caption="Connecting you to your expert…" />}

      <div className="aq-call-top">
        <span className="aq-brandmark">
          <i aria-hidden="true" />
          atomberg
        </span>
        <div className="aq-call-meta">
          {recording && (
            <span className="aq-chip rec" role="status">
              <span className="aq-rec-dot" />
              Recording
            </span>
          )}
          {reconnecting && (
            <span className="aq-chip reconnecting" role="status">
              <span className="aq-spinner" />
              Reconnecting…
            </span>
          )}
          {forceRelay && <span className="aq-chip relay">relay-only</span>}
          <span className="aq-chip">{participants.length} in call</span>
        </div>
      </div>

      {recording && (
        <div className="aq-rec-banner" role="status">
          <span className="aq-rec-dot" />
          This call is being recorded
        </div>
      )}
      {recError && (
        <div className="aq-rec-error" role="alert">
          {recError}
        </div>
      )}

      <div className="aq-stage">
        <div className="aq-focus">
          {remote ? (
            <RemoteFocus participant={remote} camTrack={remoteCam} />
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

        {isAgent && connection.sessionId && (
          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              className={`aq-ctrl ${recording ? 'rec-on' : ''}`}
              onClick={() => void toggleRecording()}
              disabled={recBusy}
              aria-label={recording ? 'Stop recording' : 'Start recording'}
            >
              <RecIcon active={recording} />
            </button>
            <span className="aq-ctrl-label">{recBusy ? '…' : recording ? 'Stop' : 'Record'}</span>
          </div>
        )}

        {connection.sessionId && (
          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              className="aq-ctrl aq-chat-toggle"
              onClick={() => setChatOpen((o) => !o)}
              aria-label="Toggle chat"
            >
              <ChatIcon />
              {unread > 0 && <span className="aq-chat-badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
            <span className="aq-ctrl-label">Chat</span>
          </div>
        )}

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

      {connection.sessionId && (
        <ChatPanel
          messages={chat.messages}
          connected={chat.connected}
          error={chat.error}
          send={chat.send}
          myIdentity={connection.identity}
          sessionId={connection.sessionId}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
