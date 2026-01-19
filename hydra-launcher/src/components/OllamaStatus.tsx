import React, { useState } from 'react';
import { Database, CheckCircle2, XCircle, RefreshCw, Cpu, Play, Square, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useOllama, OllamaState } from '../hooks/useOllama';

const OllamaStatus: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const {
    isRunning,
    models,
    isLoading,
    error,
    status,
    pid,
    isActionPending,
    refresh,
    startOllama,
    stopOllama,
    restartOllama,
  } = useOllama();

  const [actionError, setActionError] = useState<string | null>(null);

  // Get status display info
  const getStatusInfo = (state: OllamaState) => {
    switch (state) {
      case "Running":
        return { label: "AKTYWNA", color: "status-online", icon: CheckCircle2 };
      case "Stopped":
        return { label: "ZATRZYMANA", color: "status-offline", icon: XCircle };
      case "Starting":
        return { label: "URUCHAMIANIE...", color: "text-amber-500", icon: Loader2 };
      case "Stopping":
        return { label: "ZATRZYMYWANIE...", color: "text-amber-500", icon: Loader2 };
      case "Error":
        return { label: "BŁĄD", color: "text-red-500", icon: AlertCircle };
      default:
        return { label: "NIEZNANY", color: "text-gray-500", icon: XCircle };
    }
  };

  const statusInfo = getStatusInfo(status);
  const StatusIcon = statusInfo.icon;
  const isTransitioning = status === "Starting" || status === "Stopping";

  // Handle start action
  const handleStart = async () => {
    setActionError(null);
    const result = await startOllama();
    if (!result.success && result.error) {
      setActionError(result.error);
    }
  };

  // Handle stop action
  const handleStop = async () => {
    setActionError(null);
    const result = await stopOllama();
    if (!result.success && result.error) {
      setActionError(result.error);
    }
  };

  // Handle restart action
  const handleRestart = async () => {
    setActionError(null);
    const result = await restartOllama();
    if (!result.success && result.error) {
      setActionError(result.error);
    }
  };

  return (
    <div className="glass-card p-5">
      {/* Codex Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className={`text-lg ${isLight ? 'text-amber-600' : 'text-amber-500'}`}>ᚷ</span>
          <Database className={isLight ? 'text-amber-700' : 'text-amber-500/80'} size={16} />
          <h2 className="codex-header !border-0 !pb-0 !mb-0">
            LOKALNA AI
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <StatusIcon
            className={`${statusInfo.color} ${isTransitioning ? 'animate-spin' : ''}`}
            size={14}
            strokeWidth={1.5}
          />
          <span className={`text-[10px] font-cinzel font-semibold tracking-wider ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          <button
            onClick={refresh}
            className="glass-button p-1.5"
            title="Odśwież"
            disabled={isActionPending}
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Decorative Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-amber-600/40 to-transparent mb-4" />

      {/* Control Buttons */}
      <div className="flex gap-2 mb-4">
        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={isRunning || isActionPending || isTransitioning}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded border transition-all duration-200 ${
            isRunning || isActionPending || isTransitioning
              ? isLight
                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-800/30 border-gray-700/30 text-gray-600 cursor-not-allowed'
              : isLight
                ? 'bg-emerald-50 border-emerald-300/50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400'
                : 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/30 hover:border-emerald-500/50'
          }`}
          title="Uruchom Ollama"
        >
          <Play size={12} strokeWidth={2} />
          <span className="text-[9px] font-cinzel font-semibold tracking-wider">START</span>
        </button>

        {/* Stop Button */}
        <button
          onClick={handleStop}
          disabled={!isRunning || isActionPending || isTransitioning}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded border transition-all duration-200 ${
            !isRunning || isActionPending || isTransitioning
              ? isLight
                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-800/30 border-gray-700/30 text-gray-600 cursor-not-allowed'
              : isLight
                ? 'bg-red-50 border-red-300/50 text-red-700 hover:bg-red-100 hover:border-red-400'
                : 'bg-red-900/20 border-red-500/30 text-red-400 hover:bg-red-900/30 hover:border-red-500/50'
          }`}
          title="Zatrzymaj Ollama"
        >
          <Square size={12} strokeWidth={2} />
          <span className="text-[9px] font-cinzel font-semibold tracking-wider">STOP</span>
        </button>

        {/* Restart Button */}
        <button
          onClick={handleRestart}
          disabled={isActionPending || isTransitioning}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded border transition-all duration-200 ${
            isActionPending || isTransitioning
              ? isLight
                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-800/30 border-gray-700/30 text-gray-600 cursor-not-allowed'
              : isLight
                ? 'bg-amber-50 border-amber-300/50 text-amber-700 hover:bg-amber-100 hover:border-amber-400'
                : 'bg-amber-900/20 border-amber-500/30 text-amber-400 hover:bg-amber-900/30 hover:border-amber-500/50'
          }`}
          title="Restartuj Ollama"
        >
          <RotateCcw size={12} strokeWidth={2} className={isActionPending && status === "Starting" ? 'animate-spin' : ''} />
          <span className="text-[9px] font-cinzel font-semibold tracking-wider">RESTART</span>
        </button>
      </div>

      {/* Error Message */}
      {(error || actionError) && (
        <div
          className={`mb-4 p-3 rounded border ${
            isLight
              ? 'bg-red-50/60 border-red-300/30'
              : 'bg-red-900/15 border-red-500/20'
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertCircle
              size={14}
              className={isLight ? 'text-red-600 mt-0.5' : 'text-red-400 mt-0.5'}
            />
            <span className={`text-[10px] font-cinzel ${isLight ? 'text-red-700' : 'text-red-400'}`}>
              {actionError || error}
            </span>
          </div>
        </div>
      )}

      {/* Port Info & PID */}
      <div
        className={`p-3.5 rounded mb-4 border ${
          isLight
            ? 'bg-amber-50/40 border-amber-300/30'
            : 'bg-amber-900/10 border-amber-500/20'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[9px] font-cinzel tracking-wider ${isLight ? 'text-amber-600/60' : 'text-amber-500/50'}`}>
            PORT POŁĄCZENIA
          </span>
          <span className={`text-sm font-cinzel font-semibold ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
            11434
          </span>
        </div>
        {pid && (
          <div className="flex items-center justify-between pt-2 border-t border-amber-500/10">
            <span className={`text-[9px] font-cinzel tracking-wider ${isLight ? 'text-amber-600/60' : 'text-amber-500/50'}`}>
              PID PROCESU
            </span>
            <span className={`text-xs font-cinzel font-medium ${isLight ? 'text-amber-600' : 'text-amber-500/80'}`}>
              {pid}
            </span>
          </div>
        )}
      </div>

      {/* Models List */}
      <div className="space-y-2.5">
        <div className={`flex items-center gap-2 text-[9px] font-cinzel font-semibold tracking-wider ${
          isLight ? 'text-amber-700/70' : 'text-amber-500/60'
        }`}>
          <span className="text-xs">ᚹ</span>
          MODELE ({models.length})
        </div>

        {models.length === 0 ? (
          <div
            className={`text-center py-5 text-[10px] font-cinzel italic ${
              isLight ? 'text-amber-600/50' : 'text-amber-500/40'
            }`}
          >
            {isRunning ? '◇ Brak zainstalowanych modeli ◇' : '◇ Ollama nie działa ◇'}
          </div>
        ) : (
          <div className="max-h-28 overflow-auto space-y-1.5">
            {models.map((model) => (
              <div
                key={model}
                className={`flex items-center gap-2.5 p-2.5 rounded text-[10px] font-cinzel font-medium border ${
                  isLight
                    ? 'bg-amber-50/60 text-amber-700 border-amber-300/30'
                    : 'bg-amber-900/15 text-amber-400/80 border-amber-500/20'
                }`}
              >
                <Cpu size={10} strokeWidth={1.5} />
                {model}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cost Banner */}
      <div
        className={`mt-4 p-3 rounded text-center border ${
          isLight
            ? 'bg-emerald-50/60 border-emerald-300/30'
            : 'bg-emerald-900/15 border-emerald-500/20'
        }`}
      >
        <span className={`text-[9px] font-cinzel font-semibold tracking-wider ${
          isLight ? 'text-emerald-600' : 'text-emerald-400/80'
        }`}>
          ✧ KOSZT: $0.00 ✧
        </span>
      </div>
    </div>
  );
};

export default OllamaStatus;
