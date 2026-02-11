import { FolderOpen, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useClaude } from '../hooks/useClaude';
import { useClaudeStore } from '../stores/claudeStore';

// Check if running in Tauri
const isTauri = () =>
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

const viewMeta: Record<string, { title: string; subtitle?: string }> = {
  home: { title: 'Strona glowna', subtitle: 'Panel sterowania Claude HYDRA' },
  terminal: { title: 'Chat', subtitle: 'Komunikacja z agentami' },
  agents: { title: 'Agenci', subtitle: 'Zarzadzanie agentami Hydry' },
  history: { title: 'Historia', subtitle: 'Poprzednie konwersacje' },
  settings: { title: 'Ustawienia', subtitle: 'Konfiguracja aplikacji' },
};

export function Header() {
  const { currentView, workingDir, setWorkingDir } = useClaudeStore();
  const { status } = useClaude();

  const isConnected = status.is_active;
  const { title, subtitle } = viewMeta[currentView] ?? { title: currentView };

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
        const newDir = window.prompt('Podaj katalog roboczy:', workingDir);
        if (newDir) setWorkingDir(newDir);
      }
    } else {
      const newDir = window.prompt('Podaj katalog roboczy:', workingDir);
      if (newDir) setWorkingDir(newDir);
    }
  };

  return (
    <header className="h-14 px-6 flex items-center justify-between border-b border-matrix-border bg-[var(--glass-bg)] backdrop-blur-sm">
      {/* Title + Subtitle */}
      <div>
        <h1 className="text-lg font-semibold text-matrix-text">{title}</h1>
        {subtitle && <p className="text-xs text-matrix-text-dim">{subtitle}</p>}
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

      {/* Right side - Status badge + dot */}
      <div className="flex items-center gap-4">
        {status.is_active && status.session_id && (
          <span className="badge badge-default text-xs">v{status.session_id.slice(0, 8)}</span>
        )}

        <span
          className={`badge ${isConnected ? 'badge-success' : 'badge-error'} flex items-center gap-1.5`}
        >
          {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {isConnected ? 'Polaczono' : 'Rozlaczono'}
        </span>

        <div
          className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-matrix-success animate-pulse' : 'bg-matrix-error'
          }`}
        />

        <button
          type="button"
          className="p-2 rounded-lg hover:bg-matrix-accent/10 transition-colors"
          title="Odswiez"
        >
          <RefreshCw size={14} className="text-matrix-text-dim" />
        </button>
      </div>
    </header>
  );
}
