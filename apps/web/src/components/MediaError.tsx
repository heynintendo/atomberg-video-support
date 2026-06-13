import type { PreflightStatus } from '../hooks/useMediaPreflight';

interface ErrorCopy {
  title: string;
  body: string;
  bad: boolean;
}

const FALLBACK: ErrorCopy = {
  title: 'Couldn’t start your devices',
  body: 'Something went wrong reaching your camera or microphone. Retry, and if it persists, refresh the page.',
  bad: true,
};

const COPY: Record<string, ErrorCopy> = {
  denied: {
    title: 'Camera & microphone blocked',
    body: 'We need access to your camera and mic to connect you on video. Allow access in your browser (the lock icon in the address bar), then retry.',
    bad: true,
  },
  'no-device': {
    title: 'No camera or microphone found',
    body: 'We couldn’t find a camera or microphone. Plug one in or check your system settings, then retry.',
    bad: true,
  },
  'in-use': {
    title: 'Your camera or mic is busy',
    body: 'Another app (Zoom, Teams, Photo Booth…) may be using your camera or microphone. Close it, then retry.',
    bad: true,
  },
  insecure: {
    title: 'Secure connection required',
    body: 'Browsers only allow camera access over a secure (https) connection. Please open the https:// link.',
    bad: true,
  },
  unsupported: {
    title: 'Browser not supported',
    body: 'This browser can’t access your camera. Try a recent version of Chrome, Edge, Safari, or Firefox.',
    bad: true,
  },
  error: FALLBACK,
};

export function MediaError({
  status,
  onRetry,
  onLeave,
}: {
  status: PreflightStatus;
  onRetry: () => void;
  onLeave: () => void;
}) {
  const copy = COPY[status] ?? FALLBACK;
  return (
    <div className="aq-media-gate">
      <div className="aq-media-card rise">
        <div className={`aq-media-icon ${copy.bad ? 'bad' : ''}`}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" />
            {copy.bad && <line x1="2" y1="2" x2="22" y2="22" />}
          </svg>
        </div>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        <div className="aq-media-actions">
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Retry
          </button>
          <button type="button" className="btn btn-ghost" onClick={onLeave}>
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
