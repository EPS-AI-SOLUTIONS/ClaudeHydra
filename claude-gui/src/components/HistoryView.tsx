import { Check, Trash2, X, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { claudeIpc } from '../lib/ipc';
import { useClaudeStore } from '../stores/claudeStore';
import { formatApprovalType } from '../types/claude';

export function HistoryView() {
  const { history, setHistory } = useClaudeStore();

  // Load history on mount
  useEffect(() => {
    claudeIpc.getHistory().then(setHistory).catch(console.error);
  }, [setHistory]);

  const handleClear = async () => {
    await claudeIpc.clearHistory();
    setHistory([]);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-matrix-accent">Approval History</h2>
        <button
          onClick={handleClear}
          disabled={history.length === 0}
          className="glass-button flex items-center gap-2 text-sm"
        >
          <Trash2 size={14} />
          Clear
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 glass-panel p-4 overflow-y-auto">
        {history.length === 0 ? (
          <div className="text-center py-8 text-matrix-text-dim">
            <p>No approval history yet.</p>
            <p className="text-xs mt-2">Actions will appear here as they are approved or denied.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...history].reverse().map((entry) => (
              <div
                key={entry.id}
                className={`log-entry ${
                  entry.action === 'approved'
                    ? entry.auto_approved
                      ? 'log-entry-auto'
                      : 'log-entry-approved'
                    : 'log-entry-denied'
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* Icon */}
                  {entry.action === 'approved' ? (
                    entry.auto_approved ? (
                      <Zap size={14} className="text-blue-400" />
                    ) : (
                      <Check size={14} className="text-matrix-accent" />
                    )
                  ) : (
                    <X size={14} className="text-red-400" />
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">{formatApprovalType(entry.approval_type)}</span>
                    {entry.auto_approved && entry.matched_rule && (
                      <span className="ml-2 text-xs text-blue-400">
                        (Rule: {entry.matched_rule})
                      </span>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-xs text-matrix-text-dim flex-shrink-0">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
