import { Check, Copy, X } from 'lucide-react';
import { useState } from 'react';
import type { LogEntry, LogLevel } from '../../lib/ipc';

interface LogDetailModalProps {
  log: LogEntry | null;
  onClose: () => void;
}

export function LogDetailModal({ log, onClose }: LogDetailModalProps) {
  const [copied, setCopied] = useState(false);

  if (!log) return null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimestamp = (ts: number) =>
    new Date(ts).toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const levelColors: Record<LogLevel, string> = {
    debug: 'text-gray-400 bg-gray-400/10',
    info: 'text-blue-400 bg-blue-400/10',
    warn: 'text-yellow-400 bg-yellow-400/10',
    error: 'text-red-400 bg-red-400/10',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-matrix-border">
          <h3 className="text-lg font-bold text-matrix-text">Log Details</h3>
          <div className="flex items-center gap-2">
            <button onClick={copyToClipboard} className="glass-button p-2" title="Copy JSON">
              {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </button>
            <button onClick={onClose} className="glass-button p-2" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-matrix-text-dim text-xs mb-1">ID</div>
              <div className="font-mono text-matrix-text">{log.id}</div>
            </div>
            <div>
              <div className="text-matrix-text-dim text-xs mb-1">Timestamp</div>
              <div className="font-mono text-matrix-text">{formatTimestamp(log.timestamp)}</div>
            </div>
            <div>
              <div className="text-matrix-text-dim text-xs mb-1">Level</div>
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs uppercase ${levelColors[log.level]}`}
              >
                {log.level}
              </span>
            </div>
            <div>
              <div className="text-matrix-text-dim text-xs mb-1">Source</div>
              <div className="font-mono text-matrix-accent">{log.source}</div>
            </div>
          </div>

          <div>
            <div className="text-matrix-text-dim text-xs mb-1">Message</div>
            <div className="font-mono text-matrix-text bg-matrix-bg-primary/50 p-3 rounded border border-matrix-border">
              {log.message}
            </div>
          </div>

          {log.details && (
            <div>
              <div className="text-matrix-text-dim text-xs mb-1">Details (JSON)</div>
              <pre className="font-mono text-xs text-matrix-text bg-matrix-bg-primary/50 p-3 rounded border border-matrix-border overflow-auto max-h-48">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(log.details), null, 2);
                  } catch {
                    return log.details;
                  }
                })()}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
