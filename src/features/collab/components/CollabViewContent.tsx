import { Activity, FileText, Plug, PlugZap, Redo2, Undo2, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCollabDocument } from '../hooks/useCollabDocument';
import { useCollabStats } from '../hooks/useCollabStats';
import { CollabCursors } from './CollabCursors';
import { CollabStatusBadge } from './CollabStatusBadge';

/**
 * CollabView — CRDT Real-time Collaboration dashboard.
 *
 * Features:
 * - Live collaborative text editor (Yjs CRDT)
 * - Peer awareness (cursor positions, user names, AI badges)
 * - Isolated undo/redo per session (Y.UndoManager)
 * - Room statistics and monitoring
 * - Connect/disconnect controls
 */
export default function CollabViewContent() {
  const { t } = useTranslation();
  const [docKey, setDocKey] = useState('default-session');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { content, peers, status, applyChange, connect, disconnect, undo, redo, canUndo, canRedo } = useCollabDocument({
    appId: 'claudehydra',
    docKey,
    userName: 'Claude User',
    userColor: '#6366f1',
    autoConnect: true,
  });

  const { data: stats } = useCollabStats();

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const oldValue = content;

      // Find the diff position
      let start = 0;
      while (start < oldValue.length && start < newValue.length && oldValue[start] === newValue[start]) {
        start++;
      }

      let oldEnd = oldValue.length;
      let newEnd = newValue.length;
      while (oldEnd > start && newEnd > start && oldValue[oldEnd - 1] === newValue[newEnd - 1]) {
        oldEnd--;
        newEnd--;
      }

      const deleteCount = oldEnd - start;
      const insertText = newValue.slice(start, newEnd);

      applyChange(start, deleteCount, insertText);
    },
    [content, applyChange],
  );

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return (
    <motion.div
      className="flex h-full flex-col gap-4 p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-indigo-400" />
          <h1 className="text-lg font-semibold text-zinc-100">{t('collab.title')}</h1>
          <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-400">{t('collab.crdt')}</span>
        </div>

        <div className="flex items-center gap-3">
          <CollabStatusBadge status={status} peerCount={peers.length} />

          {status === 'connected' ? (
            <button
              type="button"
              onClick={disconnect}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <PlugZap className="h-3.5 w-3.5" />
              {t('collab.disconnect')}
            </button>
          ) : (
            <button
              type="button"
              onClick={connect}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <Plug className="h-3.5 w-3.5" />
              {t('collab.connect')}
            </button>
          )}
        </div>
      </div>

      {/* Document key selector */}
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-zinc-500" />
        <label htmlFor="doc-key-input" className="text-xs text-zinc-500">
          {t('collab.document')}
        </label>
        <input
          id="doc-key-input"
          type="text"
          value={docKey}
          onChange={(e) => setDocKey(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-800/50 px-2 py-1 text-xs text-zinc-300 focus:border-indigo-500 focus:outline-none"
          placeholder={t('collab.docKeyPlaceholder')}
        />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Editor */}
        <div className="flex flex-1 flex-col rounded-lg border border-zinc-700/50 bg-zinc-900/50">
          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-zinc-700/50 px-3 py-2">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-700/50 disabled:opacity-30"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-700/50 disabled:opacity-30"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="h-4 w-4" />
            </button>

            <div className="mx-2 h-4 w-px bg-zinc-700" />

            <span className="text-xs text-zinc-600">
              {content.length} {t('collab.chars')}
            </span>
          </div>

          {/* Cursors */}
          <CollabCursors peers={peers} />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextChange}
            className="flex-1 resize-none bg-transparent p-4 font-mono text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"
            placeholder={t('collab.startTyping')}
            spellCheck={false}
          />
        </div>

        {/* Sidebar: Room stats */}
        <div className="w-64 flex-shrink-0 rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-300">{t('collab.roomStats')}</h2>
          </div>

          {stats ? (
            <div className="space-y-3 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>{t('collab.activeRooms')}</span>
                <span className="text-zinc-200">{stats.active_rooms}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>{t('collab.totalPeers')}</span>
                <span className="text-zinc-200">{stats.total_peers}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>{t('collab.documents')}</span>
                <span className="text-zinc-200">{stats.total_documents}</span>
              </div>

              {stats.rooms.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-zinc-500 font-medium">{t('collab.rooms')}</h3>
                  {stats.rooms.map((room) => (
                    <div key={room.room_key} className="rounded-md border border-zinc-700/50 bg-zinc-800/30 p-2">
                      <div className="truncate text-zinc-300 font-mono">{room.room_key}</div>
                      <div className="mt-1 flex gap-3 text-zinc-500">
                        <span>{room.peer_count} peers</span>
                        <span>v{room.version}</span>
                        <span>{(room.document_size_bytes / 1024).toFixed(1)}KB</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-600">{t('collab.loadingStats')}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
