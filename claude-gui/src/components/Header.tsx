import { FolderOpen, RefreshCw } from 'lucide-react';
import { useClaude } from '../hooks/useClaude';
import { useClaudeStore } from '../stores/claudeStore';

// Check if running in Tauri
const isTauri = () =>
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

export function Header() {
  const { currentView, workingDir, setWorkingDir } = useClaudeStore();
  const { status } = useClaude();

  const viewTitles: Record<string, string> = {
    home: 'Strona główna',
    terminal: 'Terminal',
    settings: 'Ustawienia',
  };

  const handleChangeDir = async () => {
    if (isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
          directory: true,
          multiple: false,
          defaultPath: workingDir,
          title: 'Wybierz katalog roboczy',
        });
        if (selected && typeof selected === 'string') {
          setWorkingDir(selected);
        }
      } catch {
        // Fallback to prompt if dialog fails
        const newDir = window.prompt('Podaj katalog roboczy:', workingDir);
        if (newDir) setWorkingDir(newDir);
      }
    } else {
      const newDir = window.prompt('Podaj katalog roboczy:', workingDir);
      if (newDir) setWorkingDir(newDir);
    }
  };

  return (
    <header className="header glass-panel">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-matrix-text-dim">HYDRA</span>
        <span className="text-matrix-border">/</span>
        <span className="text-matrix-accent">{viewTitles[currentView] ?? currentView}</span>
      </div>

      {/* Center - Working Directory */}
      <button
        type="button"
        onClick={handleChangeDir}
        className="flex items-center gap-2 text-xs text-matrix-text-dim hover:text-matrix-accent transition-colors"
      >
        <FolderOpen size={14} />
        <span className="max-w-[300px] truncate">{workingDir}</span>
      </button>

      {/* Right side - Status */}
      <div className="flex items-center gap-4">
        {status.is_active && status.session_id && (
          <span className="text-xs text-matrix-text-dim">
            Sesja: {status.session_id.slice(0, 8)}...
          </span>
        )}

        <div className="flex items-center gap-2">
          <div
            className={`status-dot ${
              status.is_active ? 'status-dot-online' : 'status-dot-offline'
            }`}
          />
          <span className="text-xs">{status.is_active ? 'Połączony' : 'Rozłączony'}</span>
        </div>

        <button
          type="button"
          className="p-2 rounded-lg hover:bg-matrix-accent/10 transition-colors"
          title="Odśwież"
        >
          <RefreshCw size={14} className="text-matrix-text-dim" />
        </button>
      </div>
    </header>
  );
}
