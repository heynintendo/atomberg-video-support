import { useEffect, useState } from 'react';

export type PreflightStatus =
  | 'checking'
  | 'ready'
  | 'denied'
  | 'no-device'
  | 'in-use'
  | 'insecure'
  | 'unsupported'
  | 'error';

export interface Preflight {
  status: PreflightStatus;
  audio: boolean;
  video: boolean;
  retry: () => void;
}

function categorize(err: unknown): PreflightStatus {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device';
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use';
  return 'error';
}

function stop(stream: MediaStream): void {
  stream.getTracks().forEach((t) => t.stop());
}

/**
 * Probes camera + mic before joining so we can show a friendly, on-brand error
 * (and fall back to audio-only) instead of a frozen black screen. The happy path
 * is a single combined permission prompt; failures are diagnosed per-device.
 */
export function useMediaPreflight(): Preflight {
  const [state, setState] = useState<{ status: PreflightStatus; audio: boolean; video: boolean }>({
    status: 'checking',
    audio: false,
    video: false,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const md = navigator.mediaDevices;

    async function run(): Promise<void> {
      setState({ status: 'checking', audio: false, video: false });

      if (!window.isSecureContext) {
        if (!cancelled) setState({ status: 'insecure', audio: false, video: false });
        return;
      }
      if (!md?.getUserMedia) {
        if (!cancelled) setState({ status: 'unsupported', audio: false, video: false });
        return;
      }

      // Happy path: one combined prompt.
      try {
        const s = await md.getUserMedia({ audio: true, video: true });
        stop(s);
        if (!cancelled) setState({ status: 'ready', audio: true, video: true });
        return;
      } catch (combinedErr) {
        // Diagnose each device (handles partial grants, missing camera, etc.).
        let audio = false;
        let video = false;
        let lastErr: unknown = combinedErr;
        try {
          const a = await md.getUserMedia({ audio: true });
          stop(a);
          audio = true;
        } catch (e) {
          lastErr = e;
        }
        try {
          const v = await md.getUserMedia({ video: true });
          stop(v);
          video = true;
        } catch (e) {
          if (!audio) lastErr = e;
        }
        if (cancelled) return;
        if (audio || video) {
          setState({ status: 'ready', audio, video });
        } else {
          setState({ status: categorize(lastErr), audio: false, video: false });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { ...state, retry: () => setNonce((n) => n + 1) };
}
