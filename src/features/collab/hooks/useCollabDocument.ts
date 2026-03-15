import { useCallback, useEffect, useRef, useState } from 'react';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

export interface CollabPeer {
  clientId: number;
  userName: string;
  userColor: string;
  cursorAnchor?: number;
  cursorHead?: number;
  isAgent: boolean;
}

export interface UseCollabDocumentOptions {
  /** Application ID (e.g., "claudehydra") */
  appId: string;
  /** Document key (e.g., session ID) */
  docKey: string;
  /** Display name for this user */
  userName?: string;
  /** Cursor color (hex) */
  userColor?: string;
  /** Whether this is an AI agent */
  isAgent?: boolean;
  /** Backend WebSocket URL (defaults to ws://localhost:8082) */
  wsUrl?: string;
  /** Whether to connect automatically */
  autoConnect?: boolean;
}

export interface UseCollabDocumentReturn {
  /** The Yjs document instance */
  doc: Y.Doc;
  /** The shared text type (main content) */
  text: Y.Text;
  /** Current text content (reactive) */
  content: string;
  /** Connected peers with awareness info */
  peers: CollabPeer[];
  /** Connection status */
  status: 'connecting' | 'connected' | 'disconnected';
  /** Y.UndoManager for this session */
  undoManager: Y.UndoManager;
  /** Apply a text change */
  applyChange: (index: number, deleteCount: number, insertText: string) => void;
  /** Connect to the collaboration room */
  connect: () => void;
  /** Disconnect from the collaboration room */
  disconnect: () => void;
  /** Undo last change (isolated per session) */
  undo: () => void;
  /** Redo last undone change */
  redo: () => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
}

/**
 * Hook for CRDT-based real-time collaborative editing.
 *
 * Uses Yjs + y-websocket to sync document state via the ClaudeHydra
 * backend WebSocket server (`/ws/sync/{app}/{doc_key}`).
 *
 * Features:
 * - Conflict-free merging of concurrent edits
 * - Cursor awareness (other users' positions)
 * - Session-isolated undo/redo (Y.UndoManager)
 * - Automatic reconnection on disconnect
 */
export function useCollabDocument(options: UseCollabDocumentOptions): UseCollabDocumentReturn {
  const {
    appId,
    docKey,
    userName = 'Anonymous',
    userColor = '#808080',
    isAgent = false,
    wsUrl,
    autoConnect = true,
  } = options;

  const docRef = useRef(new Y.Doc());
  const providerRef = useRef<WebsocketProvider | null>(null);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);

  const [content, setContent] = useState('');
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const doc = docRef.current;
  const text = doc.getText('content');

  // Derive WS URL from backend
  const backendWsUrl = wsUrl ?? `ws://${window.location.hostname}:8082`;

  // Initialize UndoManager
  useEffect(() => {
    const um = new Y.UndoManager(text, {
      trackedOrigins: new Set([doc.clientID]),
    });

    undoManagerRef.current = um;

    const updateStackInfo = () => {
      setCanUndo(um.undoStack.length > 0);
      setCanRedo(um.redoStack.length > 0);
    };

    um.on('stack-item-added', updateStackInfo);
    um.on('stack-item-popped', updateStackInfo);

    return () => {
      um.destroy();
    };
  }, [doc, text]);

  // Observe text changes
  useEffect(() => {
    const observer = () => {
      setContent(text.toString());
    };

    text.observe(observer);
    setContent(text.toString());

    return () => {
      text.unobserve(observer);
    };
  }, [text]);

  const connect = useCallback(() => {
    if (providerRef.current) return;

    const provider = new WebsocketProvider(`${backendWsUrl}/ws/sync/${appId}`, docKey, doc, { connect: true });

    provider.on('status', (event: { status: string }) => {
      setStatus(event.status === 'connected' ? 'connected' : 'connecting');
    });

    // Set local awareness state
    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: userColor,
      isAgent,
    });

    // Observe awareness changes (other users' cursors)
    provider.awareness.on('change', () => {
      const states = provider.awareness.getStates();
      const peerList: CollabPeer[] = [];

      states.forEach((state, clientId) => {
        if (clientId === doc.clientID) return;
        const user = state['user'] as { name?: string; color?: string; isAgent?: boolean } | undefined;
        if (user) {
          const cursor = state['cursor'] as { anchor?: number; head?: number } | undefined;
          peerList.push({
            clientId,
            userName: user.name ?? 'Unknown',
            userColor: user.color ?? '#808080',
            isAgent: user.isAgent ?? false,
            cursorAnchor: cursor?.anchor,
            cursorHead: cursor?.head,
          });
        }
      });

      setPeers(peerList);
    });

    provider.on('connection-close', () => {
      setStatus('disconnected');
    });

    providerRef.current = provider;
    setStatus('connecting');
  }, [appId, docKey, doc, userName, userColor, isAgent, backendWsUrl]);

  const disconnect = useCallback(() => {
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
      setStatus('disconnected');
      setPeers([]);
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  const applyChange = useCallback(
    (index: number, deleteCount: number, insertText: string) => {
      doc.transact(() => {
        if (deleteCount > 0) {
          text.delete(index, deleteCount);
        }
        if (insertText) {
          text.insert(index, insertText);
        }
      }, doc.clientID);
    },
    [doc, text],
  );

  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);

  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);

  return {
    doc,
    text,
    content,
    peers,
    status,
    undoManager: undoManagerRef.current ?? new Y.UndoManager(text),
    applyChange,
    connect,
    disconnect,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
