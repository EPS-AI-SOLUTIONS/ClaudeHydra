import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { useClaudeStore } from '../stores/claudeStore';
import { formatSizeGB } from '../utils/format';

// Check if running in Tauri (v2 uses __TAURI_INTERNALS__)
const isTauri = () =>
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

interface OllamaModel {
  name: string;
  modified_at?: string;
  size?: number;
}

export function StatusLine() {
  const { status, isConnecting, pendingApproval } = useClaudeStore();
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Check Ollama health periodically
  useEffect(() => {
    if (!isTauri()) return; // Skip in browser mode

    const checkOllama = async () => {
      try {
        const isHealthy = await invoke<boolean>('ollama_health_check');
        setOllamaConnected(isHealthy);

        if (isHealthy) {
          const models = await invoke<OllamaModel[]>('ollama_list_models');
          setOllamaModels(models);
        }
      } catch {
        setOllamaConnected(false);
        setOllamaModels([]);
      }
    };

    checkOllama();
    const interval = setInterval(checkOllama, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="glass-panel px-3 py-1.5 flex items-center justify-between text-[11px] font-mono border-t border-matrix-accent/20">
      {/* Left section - Session status */}
      <div className="flex items-center gap-4">
        {/* Claude Session Status */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnecting
                ? 'bg-matrix-warning animate-pulse'
                : status.is_active
                  ? 'bg-matrix-accent shadow-[0_0_6px_rgba(0,255,65,0.6)]'
                  : 'bg-matrix-text-dim'
            }`}
          />
          <span className="text-matrix-text-secondary">
            Claude: {isConnecting ? 'Łączenie...' : status.is_active ? 'Aktywny' : 'Nieaktywny'}
          </span>
        </div>

        {/* Ollama Status */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${
              ollamaConnected
                ? 'bg-cyan-400 shadow-[0_0_6px_rgba(0,255,255,0.6)]'
                : 'bg-matrix-text-dim'
            }`}
          />
          <span className="text-matrix-text-secondary">
            Ollama: {ollamaConnected ? `${ollamaModels.length} modeli` : 'Offline'}
          </span>
        </div>

        {/* Auto-approve indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${
              status.auto_approve_all
                ? 'bg-matrix-warning shadow-[0_0_6px_rgba(255,176,0,0.6)]'
                : 'bg-matrix-text-dim'
            }`}
          />
          <span className="text-matrix-text-secondary">
            Auto: {status.auto_approve_all ? 'ON' : 'OFF'}
          </span>
        </div>

        {/* Pending approval */}
        {pendingApproval && (
          <div className="flex items-center gap-1.5 text-matrix-warning animate-pulse">
            <svg
              className="w-3 h-3"
              fill="currentColor"
              viewBox="0 0 20 20"
              role="img"
              aria-label="Ostrzeżenie"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>Oczekuje na zatwierdzenie</span>
          </div>
        )}
      </div>

      {/* Center section - Statistics */}
      <div className="flex items-center gap-4 text-matrix-text-dim">
        <span title="Zatwierdzone">
          <span className="text-matrix-accent">✓</span> {status.approved_count}
        </span>
        <span title="Odrzucone">
          <span className="text-matrix-error">✗</span> {status.denied_count}
        </span>
        <span title="Automatyczne">
          <span className="text-matrix-warning">⚡</span> {status.auto_approved_count}
        </span>
      </div>

      {/* Right section - Models & Time */}
      <div className="flex items-center gap-4">
        {/* Available models */}
        {ollamaConnected && ollamaModels.length > 0 && (
          <div className="flex items-center gap-1 text-matrix-text-dim">
            <span className="text-cyan-400">⚙</span>
            <span
              className="max-w-[150px] truncate"
              title={ollamaModels.map((m) => m.name).join(', ')}
            >
              {ollamaModels.slice(0, 2).map((m, i) => (
                <span key={m.name}>
                  {i > 0 && ', '}
                  {m.name.split(':')[0]}
                  <span className="text-matrix-text-dim/50 text-[9px] ml-0.5">
                    {formatSizeGB(m.size)}
                  </span>
                </span>
              ))}
              {ollamaModels.length > 2 && <span className="text-matrix-text-dim/50">...</span>}
            </span>
          </div>
        )}

        {/* Version */}
        <span className="text-matrix-text-dim">v0.1.0</span>

        {/* Time */}
        <span className="text-matrix-accent font-semibold tabular-nums">
          {currentTime.toLocaleTimeString('pl-PL', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      </div>
    </footer>
  );
}
