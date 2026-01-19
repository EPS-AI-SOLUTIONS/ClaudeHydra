import React, { useState } from 'react';
import { Loader2, Terminal, CheckCircle2, AlertCircle, Sword } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useTheme } from '../contexts/ThemeContext';
import { useMCPHealth } from '../hooks/useMCPHealth';
import { useOllama } from '../hooks/useOllama';

const LaunchPanel: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchStatus, setLaunchStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const { allOnline, onlineCount, totalCount } = useMCPHealth();
  const { isRunning: ollamaRunning } = useOllama();

  const handleLaunch = async () => {
    setIsLaunching(true);
    setLaunchStatus('idle');
    setErrorMessage('');

    try {
      // Get YOLO mode from localStorage
      const yoloEnabled = localStorage.getItem('hydra_yolo') !== 'false';

      await invoke('launch_claude', { yoloMode: yoloEnabled });
      setLaunchStatus('success');

      // Close the launcher after successful launch
      setTimeout(() => {
        window.close();
      }, 1500);
    } catch (e) {
      setLaunchStatus('error');
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLaunching(false);
    }
  };

  const canLaunch = onlineCount > 0; // At least one MCP server should be online

  return (
    <div className="glass-card p-5">
      {/* Codex Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className={`text-lg ${isLight ? 'text-amber-600' : 'text-amber-500'}`}>ᛉ</span>
        <Terminal className={isLight ? 'text-amber-700' : 'text-amber-500/80'} size={16} />
        <h2 className="codex-header !border-0 !pb-0 !mb-0">
          URUCHOM HYDRĘ
        </h2>
      </div>

      {/* Decorative Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-amber-600/40 to-transparent mb-4" />

      {/* Status Summary - Witcher Style */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatusItem
          label="SERWERY MCP"
          value={`${onlineCount}/${totalCount}`}
          rune="ᚠ"
          status={allOnline ? 'success' : onlineCount > 0 ? 'warning' : 'error'}
          isLight={isLight}
        />
        <StatusItem
          label="OLLAMA"
          value={ollamaRunning ? 'Aktywna' : 'Nieaktywna'}
          rune="ᚷ"
          status={ollamaRunning ? 'success' : 'warning'}
          isLight={isLight}
        />
      </div>

      {/* Launch Button - Epic Witcher Style */}
      <button
        onClick={handleLaunch}
        disabled={isLaunching || !canLaunch}
        className={`
          w-full py-4 rounded font-cinzel font-semibold text-sm tracking-[0.15em] uppercase
          transition-all duration-500 flex items-center justify-center gap-3
          border-2 relative overflow-hidden
          ${
            canLaunch
              ? isLight
                ? 'bg-gradient-to-b from-amber-100 to-amber-200 text-amber-800 border-amber-500 hover:from-amber-200 hover:to-amber-300 hover:border-amber-600'
                : 'bg-gradient-to-b from-amber-900/30 to-amber-900/50 text-amber-400 border-amber-500 hover:from-amber-800/40 hover:to-amber-800/60 hover:border-amber-400'
              : isLight
                ? 'bg-slate-100 text-slate-400 border-slate-300 cursor-not-allowed'
                : 'bg-slate-900/30 text-slate-600 border-slate-700 cursor-not-allowed'
          }
          ${isLaunching ? 'opacity-70 cursor-wait' : ''}
        `}
        style={{}}
      >
        {/* Shimmer effect removed */}

        {isLaunching ? (
          <>
            <Loader2 className="animate-spin" size={18} />
            OTWIERANIE KODEKSU...
          </>
        ) : launchStatus === 'success' ? (
          <>
            <CheckCircle2 size={18} />
            ⚔ KODEKS OTWARTY ⚔
          </>
        ) : (
          <>
            <Sword size={18} />
            ⚔ OBUDŹ HYDRĘ ⚔
          </>
        )}
      </button>

      {/* Error Message */}
      {launchStatus === 'error' && errorMessage && (
        <div className={`mt-4 p-3 rounded border flex items-start gap-2.5 ${
          isLight
            ? 'bg-red-50/60 border-red-300/50'
            : 'bg-red-900/20 border-red-500/30'
        }`}>
          <AlertCircle className="status-offline shrink-0 mt-0.5" size={14} />
          <p className="text-[10px] font-cinzel text-red-400/90">{errorMessage}</p>
        </div>
      )}

      {/* Help Text */}
      <p className={`text-[9px] text-center mt-4 font-cinzel italic tracking-wide ${
        isLight ? 'text-amber-600/50' : 'text-amber-500/40'
      }`}>
        {canLaunch
          ? '◇ Uruchom Claude CLI ◇'
          : '◇ Uruchom przynajmniej jeden serwer MCP ◇'}
      </p>

      {/* Bottom Rune Decoration */}
      <div className="mt-4 text-center">
        <span className={`text-[10px] tracking-[0.5em] ${isLight ? 'text-amber-600/30' : 'text-amber-500/20'}`}>
          ᛟ ᛞ ᛜ
        </span>
      </div>
    </div>
  );
};

const StatusItem: React.FC<{
  label: string;
  value: string;
  rune: string;
  status: 'success' | 'warning' | 'error';
  isLight: boolean;
}> = ({ label, value, rune, status, isLight }) => {
  const statusColors = {
    success: 'status-online',
    warning: 'status-warning',
    error: 'status-offline',
  };

  const bgColors = {
    success: isLight ? 'bg-emerald-50/60 border-emerald-300/30' : 'bg-emerald-900/15 border-emerald-500/20',
    warning: isLight ? 'bg-amber-50/60 border-amber-300/30' : 'bg-amber-900/15 border-amber-500/20',
    error: isLight ? 'bg-red-50/60 border-red-300/30' : 'bg-red-900/15 border-red-500/20',
  };

  return (
    <div
      className={`p-3.5 rounded transition-all duration-300 border ${bgColors[status]}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-sm ${statusColors[status]}`}>{rune}</span>
        <span className={`text-[9px] font-cinzel tracking-wider ${
          isLight ? 'text-amber-600/60' : 'text-amber-500/50'
        }`}>
          {label}
        </span>
      </div>
      <div className={`text-sm font-cinzel font-semibold ${statusColors[status]}`}>
        {value}
      </div>
    </div>
  );
};

export default LaunchPanel;
