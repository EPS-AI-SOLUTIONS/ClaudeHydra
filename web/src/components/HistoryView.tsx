'use client';

import { Check, Trash2, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ApprovalHistoryEntry } from '@/types/claude';
import { formatApprovalType } from '@/types/claude';

export function HistoryView() {
  const [history, setHistory] = useState<ApprovalHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Load history from API
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/claude/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleClear = async () => {
    try {
      await fetch('/api/claude/history', { method: 'DELETE' });
      setHistory([]);
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('pl-PL');
  };

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-[var(--matrix-accent)]">Historia zatwierdzeń</h2>
        <button
          onClick={handleClear}
          disabled={history.length === 0}
          className="glass-button flex items-center gap-2 text-sm"
        >
          <Trash2 size={14} />
          Wyczyść
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 glass-panel p-4 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8 text-[var(--matrix-text-secondary)]">
            <p>Ładowanie...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-[var(--matrix-text-secondary)]">
            <p>Brak historii zatwierdzeń.</p>
            <p className="text-xs mt-2">
              Akcje pojawią się tutaj po ich zatwierdzeniu lub odrzuceniu.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...history].reverse().map((entry) => (
              <div
                key={entry.id}
                className={`p-3 rounded-lg border ${
                  entry.action === 'approved'
                    ? entry.auto_approved
                      ? 'border-blue-500/30 bg-blue-500/5'
                      : 'border-[var(--matrix-accent)]/30 bg-[var(--matrix-accent)]/5'
                    : 'border-red-500/30 bg-red-500/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  {entry.action === 'approved' ? (
                    entry.auto_approved ? (
                      <Zap size={14} className="text-blue-400" />
                    ) : (
                      <Check size={14} className="text-[var(--matrix-accent)]" />
                    )
                  ) : (
                    <X size={14} className="text-red-400" />
                  )}

                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-[var(--matrix-text-primary)]">
                      {formatApprovalType(entry.approval_type)}
                    </span>
                    {entry.auto_approved && entry.matched_rule && (
                      <span className="ml-2 text-xs text-blue-400">
                        (Reguła: {entry.matched_rule})
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-[var(--matrix-text-secondary)] flex-shrink-0">
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
