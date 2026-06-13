import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessageDTO, ChatServerFrame } from '@atomquest/shared';

export interface ChatState {
  messages: ChatMessageDTO[];
  connected: boolean;
  error: string | null;
  send: (body: string) => void;
}

// Connects to the backend-authoritative chat socket (same-origin wss; the session
// cookie authenticates the handshake). On every (re)connect the server replays
// history, which we use to re-sync cleanly — no drops, no duplicates.
export function useChat(sessionId: string | undefined): ChatState {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const closedRef = useRef(false);
  const retryRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionId) return undefined;
    closedRef.current = false;

    const open = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/api/sessions/${sessionId}/chat`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        let frame: ChatServerFrame;
        try {
          frame = JSON.parse(e.data as string) as ChatServerFrame;
        } catch {
          return;
        }
        if (frame.type === 'chat.history') {
          setMessages(frame.messages);
        } else if (frame.type === 'chat.message') {
          setMessages((prev) => (prev.some((m) => m.id === frame.message.id) ? prev : [...prev, frame.message]));
        } else if (frame.type === 'chat.error') {
          setError(frame.error);
          window.setTimeout(() => setError(null), 2500);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!closedRef.current) {
          retryRef.current = window.setTimeout(open, 1500);
        }
      };
      ws.onerror = () => {
        // the close handler schedules the reconnect
      };
    };

    open();
    return () => {
      closedRef.current = true;
      if (retryRef.current) window.clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [sessionId]);

  const send = useCallback((body: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const clientMsgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      ws.send(JSON.stringify({ type: 'chat.send', clientMsgId, body }));
    }
  }, []);

  return { messages, connected, error, send };
}
