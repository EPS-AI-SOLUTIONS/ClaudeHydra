'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SSEOptions {
  /** URL endpointu SSE */
  url: string;
  /** Czy automatycznie połączyć przy mount */
  autoConnect?: boolean;
  /** Maksymalna liczba prób reconnectu */
  maxRetries?: number;
  /** Bazowy delay reconnectu w ms (podwajany z każdą próbą) */
  retryDelay?: number;
  /** Callback dla konkretnych typów eventów */
  onEvent?: (event: string, data: unknown) => void;
  /** Callback na błąd */
  onError?: (error: Event) => void;
  /** Callback na otwarcie połączenia */
  onOpen?: () => void;
}

export interface SSEState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  retryCount: number;
}

export function useSSE(options: SSEOptions) {
  const {
    url,
    autoConnect = true,
    maxRetries = 5,
    retryDelay = 1000,
    onEvent,
    onError,
    onOpen,
  } = options;

  const [state, setState] = useState<SSEState>({
    connected: false,
    connecting: false,
    error: null,
    retryCount: 0,
  });

  const esRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const callbacksRef = useRef({ onEvent, onError, onOpen });

  // Aktualizuj referencje callbacków bez re-renderingu
  callbacksRef.current = { onEvent, onError, onOpen };

  const disconnect = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    retryCountRef.current = 0;
    setState({
      connected: false,
      connecting: false,
      error: null,
      retryCount: 0,
    });
  }, []);

  const connect = useCallback(() => {
    // Zamknij poprzednie połączenie
    if (esRef.current) {
      esRef.current.close();
    }

    setState((prev) => ({ ...prev, connecting: true, error: null }));

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      retryCountRef.current = 0;
      setState({
        connected: true,
        connecting: false,
        error: null,
        retryCount: 0,
      });
      callbacksRef.current.onOpen?.();
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        callbacksRef.current.onEvent?.('message', data);
      } catch {
        callbacksRef.current.onEvent?.('message', event.data);
      }
    };

    es.onerror = (event) => {
      es.close();
      esRef.current = null;

      setState((prev) => ({
        ...prev,
        connected: false,
        connecting: false,
        error: 'Połączenie SSE przerwane',
      }));

      callbacksRef.current.onError?.(event);

      // Auto-reconnect z exponential backoff
      if (retryCountRef.current < maxRetries) {
        const delay = retryDelay * 2 ** retryCountRef.current;
        retryCountRef.current++;
        setState((prev) => ({
          ...prev,
          retryCount: retryCountRef.current,
        }));
        retryTimerRef.current = setTimeout(connect, delay);
      }
    };

    // Nasłuchuj named events (nie tylko "message")
    // EventSource API wymaga addEventListener dla named events
    es.addEventListener('claude-event', (e) => {
      try {
        callbacksRef.current.onEvent?.('claude-event', JSON.parse(e.data));
      } catch {
        callbacksRef.current.onEvent?.('claude-event', e.data);
      }
    });

    es.addEventListener('approval-required', (e) => {
      try {
        callbacksRef.current.onEvent?.('approval-required', JSON.parse(e.data));
      } catch {
        callbacksRef.current.onEvent?.('approval-required', e.data);
      }
    });

    es.addEventListener('auto-approved', (e) => {
      try {
        callbacksRef.current.onEvent?.('auto-approved', JSON.parse(e.data));
      } catch {
        callbacksRef.current.onEvent?.('auto-approved', e.data);
      }
    });

    es.addEventListener('session-ended', (e) => {
      try {
        callbacksRef.current.onEvent?.('session-ended', JSON.parse(e.data));
      } catch {
        callbacksRef.current.onEvent?.('session-ended', e.data);
      }
    });

    es.addEventListener('debug-log', (e) => {
      try {
        callbacksRef.current.onEvent?.('debug-log', JSON.parse(e.data));
      } catch {
        callbacksRef.current.onEvent?.('debug-log', e.data);
      }
    });
  }, [url, maxRetries, retryDelay]);

  // Auto-connect przy mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return disconnect;
  }, [autoConnect, connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
  };
}
