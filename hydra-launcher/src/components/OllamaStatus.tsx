import React, { useState, useEffect, useRef } from 'react';
import { Database, CheckCircle2, XCircle, RefreshCw, Cpu, Play, Square, RotateCcw, AlertCircle, Loader2, Zap, HardDrive } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useOllama, OllamaState } from '../hooks/useOllama';

// Animated counter hook
const useAnimatedCounter = (target: number, duration: number = 500) => {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(target);

  useEffect(() => {
    if (target === prevTarget.current) return;

    const startValue = prevTarget.current;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = Math.round(startValue + (target - startValue) * eased);

      setCount(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        prevTarget.current = target;
      }
    };

    requestAnimationFrame(animate);
  }, [target, duration]);

  useEffect(() => {
    setCount(target);
    prevTarget.current = target;
  }, []);

  return count;
};

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
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  // Animated counters
  const animatedModelCount = useAnimatedCounter(models.length);
  const animatedPid = useAnimatedCounter(pid || 0);

  // Get status display info with gradient colors
  const getStatusInfo = (state: OllamaState) => {
    switch (state) {
      case "Running":
        return {
          label: "AKTYWNA",
          dotClass: "bg-emerald-500",
          textClass: isLight ? "text-emerald-600" : "text-emerald-400",
          pulseClass: "animate-pulse-glow-green",
          icon: CheckCircle2
        };
      case "Stopped":
        return {
          label: "ZATRZYMANA",
          dotClass: isLight ? "bg-gray-400" : "bg-gray-500",
          textClass: isLight ? "text-gray-500" : "text-gray-400",
          pulseClass: "",
          icon: XCircle
        };
      case "Starting":
        return {
          label: "URUCHAMIANIE...",
          dotClass: "bg-amber-500",
          textClass: isLight ? "text-amber-600" : "text-amber-400",
          pulseClass: "animate-pulse-fast",
          icon: Loader2
        };
      case "Stopping":
        return {
          label: "ZATRZYMYWANIE...",
          dotClass: "bg-amber-500",
          textClass: isLight ? "text-amber-600" : "text-amber-400",
          pulseClass: "animate-pulse-fast",
          icon: Loader2
        };
      case "Error":
        return {
          label: "BLAD",
          dotClass: "bg-red-500",
          textClass: isLight ? "text-red-600" : "text-red-400",
          pulseClass: "",
          icon: AlertCircle
        };
      default:
        return {
          label: "NIEZNANY",
          dotClass: "bg-gray-500",
          textClass: "text-gray-400",
          pulseClass: "",
          icon: XCircle
        };
    }
  };

  const statusInfo = getStatusInfo(status);
  // StatusIcon available for future use: statusInfo.icon
  const isTransitioning = status === "Starting" || status === "Stopping";

  // Handle actions
  const handleStart = async () => {
    setActionError(null);
    const result = await startOllama();
    if (!result.success && result.error) {
      setActionError(result.error);
    }
  };

  const handleStop = async () => {
    setActionError(null);
    const result = await stopOllama();
    if (!result.success && result.error) {
      setActionError(result.error);
    }
  };

  const handleRestart = async () => {
    setActionError(null);
    const result = await restartOllama();
    if (!result.success && result.error) {
      setActionError(result.error);
    }
  };

  // Button component with gradient and glow
  const ControlButton: React.FC<{
    onClick: () => void;
    disabled: boolean;
    variant: 'start' | 'stop' | 'restart';
    icon: React.ReactNode;
    label: string;
    isLoading?: boolean;
  }> = ({ onClick, disabled, variant, icon, label, isLoading: btnLoading }) => {
    const isHovered = hoveredButton === variant;

    const gradients = {
      start: {
        bg: isLight
          ? 'bg-gradient-to-br from-emerald-50 via-emerald-100 to-teal-50'
          : 'bg-gradient-to-br from-emerald-900/30 via-emerald-800/20 to-teal-900/30',
        border: isLight ? 'border-emerald-300/60' : 'border-emerald-500/40',
        text: isLight ? 'text-emerald-700' : 'text-emerald-400',
        glow: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]',
        hoverBg: isLight
          ? 'hover:from-emerald-100 hover:via-emerald-150 hover:to-teal-100'
          : 'hover:from-emerald-800/40 hover:via-emerald-700/30 hover:to-teal-800/40',
      },
      stop: {
        bg: isLight
          ? 'bg-gradient-to-br from-red-50 via-rose-100 to-pink-50'
          : 'bg-gradient-to-br from-red-900/30 via-rose-800/20 to-pink-900/30',
        border: isLight ? 'border-red-300/60' : 'border-red-500/40',
        text: isLight ? 'text-red-700' : 'text-red-400',
        glow: 'hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]',
        hoverBg: isLight
          ? 'hover:from-red-100 hover:via-rose-150 hover:to-pink-100'
          : 'hover:from-red-800/40 hover:via-rose-700/30 hover:to-pink-800/40',
      },
      restart: {
        bg: isLight
          ? 'bg-gradient-to-br from-amber-50 via-orange-100 to-yellow-50'
          : 'bg-gradient-to-br from-amber-900/30 via-orange-800/20 to-yellow-900/30',
        border: isLight ? 'border-amber-300/60' : 'border-amber-500/40',
        text: isLight ? 'text-amber-700' : 'text-amber-400',
        glow: 'hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]',
        hoverBg: isLight
          ? 'hover:from-amber-100 hover:via-orange-150 hover:to-yellow-100'
          : 'hover:from-amber-800/40 hover:via-orange-700/30 hover:to-yellow-800/40',
      },
    };

    const style = gradients[variant];

    const disabledClass = isLight
      ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-50'
      : 'bg-gray-800/20 border-gray-700/30 text-gray-600 cursor-not-allowed opacity-50';

    return (
      <button
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setHoveredButton(variant)}
        onMouseLeave={() => setHoveredButton(null)}
        className={`
          flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-lg border
          transition-all duration-300 ease-out
          transform hover:scale-[1.02] active:scale-[0.98]
          ${disabled
            ? disabledClass
            : `${style.bg} ${style.border} ${style.text} ${style.glow} ${style.hoverBg}`
          }
        `}
        title={label}
      >
        <span className={`transition-transform duration-300 ${isHovered && !disabled ? 'scale-110' : ''}`}>
          {btnLoading ? (
            <Loader2 size={14} strokeWidth={2} className="animate-spin" />
          ) : (
            icon
          )}
        </span>
        <span className="text-[9px] font-mono font-semibold tracking-wider">
          {label}
        </span>
      </button>
    );
  };

  // Model card with gradient
  const ModelCard: React.FC<{ model: string; index: number }> = ({ model, index }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ animationDelay: `${index * 50}ms` }}
        className={`
          flex items-center gap-3 p-3 rounded-lg border
          transition-all duration-300 ease-out
          animate-slide-in
          ${isLight
            ? 'bg-gradient-to-r from-slate-50 via-gray-50 to-zinc-50 border-gray-200/60 hover:border-gray-300'
            : 'bg-gradient-to-r from-slate-800/40 via-gray-800/30 to-zinc-800/40 border-gray-700/40 hover:border-gray-600'
          }
          ${isHovered ? 'shadow-lg transform scale-[1.01]' : 'shadow-sm'}
        `}
      >
        <div className={`
          p-1.5 rounded-md transition-all duration-300
          ${isLight
            ? 'bg-gradient-to-br from-blue-100 to-indigo-100'
            : 'bg-gradient-to-br from-blue-900/40 to-indigo-900/40'
          }
          ${isHovered ? 'scale-110' : ''}
        `}>
          <Cpu size={12} strokeWidth={1.5} className={isLight ? 'text-blue-600' : 'text-blue-400'} />
        </div>
        <span className={`text-[11px] font-mono font-medium truncate ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
          {model}
        </span>
        {isHovered && (
          <Zap size={10} className={`ml-auto ${isLight ? 'text-amber-500' : 'text-amber-400'} animate-pulse`} />
        )}
      </div>
    );
  };

  // Simulated memory usage (for visual demo - would need actual data from Ollama API)
  const memoryUsage = isRunning ? Math.min(30 + models.length * 15, 85) : 0;

  return (
    <div className="glass-card p-5 relative overflow-hidden">
      {/* Background gradient decoration */}
      <div className={`
        absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none
        transition-all duration-700
        ${isRunning
          ? (isLight ? 'bg-emerald-400' : 'bg-emerald-600')
          : (isLight ? 'bg-gray-300' : 'bg-gray-700')
        }
      `} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className={`
            p-2 rounded-lg transition-all duration-300
            ${isLight
              ? 'bg-gradient-to-br from-amber-100 to-orange-100'
              : 'bg-gradient-to-br from-amber-900/40 to-orange-900/40'
            }
          `}>
            <Database className={isLight ? 'text-amber-700' : 'text-amber-500'} size={16} />
          </div>
          <h2 className="text-xs font-mono font-semibold tracking-wider uppercase">
            LOKALNA AI
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Animated Status Dot */}
          <div className="relative">
            <div className={`
              w-2.5 h-2.5 rounded-full transition-all duration-500
              ${statusInfo.dotClass}
              ${statusInfo.pulseClass}
            `} />
            {isRunning && (
              <div className={`
                absolute inset-0 w-2.5 h-2.5 rounded-full
                ${statusInfo.dotClass}
                animate-ping opacity-75
              `} />
            )}
          </div>

          <span className={`text-[10px] font-mono font-semibold tracking-wider ${statusInfo.textClass}`}>
            {statusInfo.label}
          </span>

          <button
            onClick={refresh}
            className={`
              p-2 rounded-lg border transition-all duration-300
              hover:scale-105 active:scale-95
              ${isLight
                ? 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                : 'bg-gray-800/40 border-gray-700/50 hover:bg-gray-700/40 hover:border-gray-600'
              }
            `}
            title="Odswiez"
            disabled={isActionPending}
          >
            <RefreshCw
              size={12}
              className={`
                transition-transform duration-500
                ${isLoading ? 'animate-spin' : 'hover:rotate-180'}
              `}
            />
          </button>
        </div>
      </div>

      {/* Gradient Divider */}
      <div className={`
        h-px mb-4 rounded-full
        ${isLight
          ? 'bg-gradient-to-r from-transparent via-gray-300 to-transparent'
          : 'bg-gradient-to-r from-transparent via-gray-600 to-transparent'
        }
      `} />

      {/* Control Buttons */}
      <div className="flex gap-2 mb-4">
        <ControlButton
          onClick={handleStart}
          disabled={isRunning || isActionPending || isTransitioning}
          variant="start"
          icon={<Play size={14} strokeWidth={2} />}
          label="START"
          isLoading={isActionPending && status === "Starting"}
        />
        <ControlButton
          onClick={handleStop}
          disabled={!isRunning || isActionPending || isTransitioning}
          variant="stop"
          icon={<Square size={14} strokeWidth={2} />}
          label="STOP"
          isLoading={isActionPending && status === "Stopping"}
        />
        <ControlButton
          onClick={handleRestart}
          disabled={isActionPending || isTransitioning}
          variant="restart"
          icon={<RotateCcw size={14} strokeWidth={2} className={isActionPending && status === "Starting" ? 'animate-spin' : ''} />}
          label="RESTART"
          isLoading={false}
        />
      </div>

      {/* Error Message */}
      {(error || actionError) && (
        <div className={`
          mb-4 p-3 rounded-lg border backdrop-blur-sm
          animate-shake
          ${isLight
            ? 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200'
            : 'bg-gradient-to-r from-red-900/20 to-rose-900/20 border-red-500/30'
          }
        `}>
          <div className="flex items-start gap-2">
            <AlertCircle
              size={14}
              className={`mt-0.5 ${isLight ? 'text-red-600' : 'text-red-400'}`}
            />
            <span className={`text-[10px] font-mono ${isLight ? 'text-red-700' : 'text-red-400'}`}>
              {actionError || error}
            </span>
          </div>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Port Card */}
        <div className={`
          p-3 rounded-lg border transition-all duration-300
          ${isLight
            ? 'bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 border-blue-200/50'
            : 'bg-gradient-to-br from-blue-900/20 via-indigo-900/15 to-violet-900/20 border-blue-500/30'
          }
        `}>
          <div className={`text-[8px] font-mono tracking-wider mb-1 ${isLight ? 'text-blue-500/70' : 'text-blue-400/60'}`}>
            PORT
          </div>
          <div className={`text-lg font-mono font-bold ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>
            11434
          </div>
        </div>

        {/* PID Card */}
        <div className={`
          p-3 rounded-lg border transition-all duration-300
          ${isLight
            ? 'bg-gradient-to-br from-purple-50 via-fuchsia-50 to-pink-50 border-purple-200/50'
            : 'bg-gradient-to-br from-purple-900/20 via-fuchsia-900/15 to-pink-900/20 border-purple-500/30'
          }
        `}>
          <div className={`text-[8px] font-mono tracking-wider mb-1 ${isLight ? 'text-purple-500/70' : 'text-purple-400/60'}`}>
            PID
          </div>
          <div className={`text-lg font-mono font-bold ${isLight ? 'text-purple-700' : 'text-purple-400'}`}>
            {pid ? animatedPid : '---'}
          </div>
        </div>
      </div>

      {/* Memory Usage Progress Bar */}
      {isRunning && (
        <div className={`
          p-3 rounded-lg border mb-4 transition-all duration-500
          ${isLight
            ? 'bg-gradient-to-r from-slate-50 to-gray-50 border-gray-200/50'
            : 'bg-gradient-to-r from-slate-800/30 to-gray-800/30 border-gray-700/30'
          }
        `}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <HardDrive size={12} className={isLight ? 'text-gray-500' : 'text-gray-400'} />
              <span className={`text-[9px] font-mono tracking-wider ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                PAMIEC
              </span>
            </div>
            <span className={`text-[10px] font-mono font-semibold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
              {memoryUsage}%
            </span>
          </div>
          <div className={`
            h-2 rounded-full overflow-hidden
            ${isLight ? 'bg-gray-200' : 'bg-gray-700/50'}
          `}>
            <div
              className={`
                h-full rounded-full transition-all duration-700 ease-out
                bg-gradient-to-r
                ${memoryUsage > 70
                  ? 'from-red-500 via-orange-500 to-amber-500'
                  : memoryUsage > 40
                    ? 'from-amber-500 via-yellow-500 to-lime-500'
                    : 'from-emerald-500 via-teal-500 to-cyan-500'
                }
              `}
              style={{ width: `${memoryUsage}%` }}
            />
          </div>
        </div>
      )}

      {/* Gradient Divider */}
      <div className={`
        h-px mb-4 rounded-full
        ${isLight
          ? 'bg-gradient-to-r from-transparent via-gray-300 to-transparent'
          : 'bg-gradient-to-r from-transparent via-gray-600 to-transparent'
        }
      `} />

      {/* Models List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-2 text-[9px] font-mono font-semibold tracking-wider ${
            isLight ? 'text-gray-600' : 'text-gray-400'
          }`}>
            <Cpu size={12} />
            MODELE
          </div>
          <div className={`
            px-2 py-0.5 rounded-full text-[10px] font-mono font-bold
            ${isLight
              ? 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700'
              : 'bg-gradient-to-r from-blue-900/40 to-indigo-900/40 text-blue-400'
            }
          `}>
            {animatedModelCount}
          </div>
        </div>

        {models.length === 0 ? (
          <div className={`
            text-center py-6 rounded-lg border border-dashed
            ${isLight
              ? 'border-gray-300 bg-gray-50/50'
              : 'border-gray-700 bg-gray-800/20'
            }
          `}>
            <Database size={24} className={`mx-auto mb-2 ${isLight ? 'text-gray-400' : 'text-gray-600'}`} />
            <span className={`text-[10px] font-mono italic ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
              {isRunning ? 'Brak zainstalowanych modeli' : 'Ollama nie dziala'}
            </span>
          </div>
        ) : (
          <div className="max-h-32 overflow-auto space-y-2 pr-1">
            {models.map((model, index) => (
              <ModelCard key={model} model={model} index={index} />
            ))}
          </div>
        )}
      </div>

      {/* Cost Banner */}
      <div className={`
        mt-4 p-3 rounded-lg text-center border
        transition-all duration-300 hover:scale-[1.01]
        ${isLight
          ? 'bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-emerald-200/50'
          : 'bg-gradient-to-r from-emerald-900/20 via-teal-900/15 to-cyan-900/20 border-emerald-500/30'
        }
      `}>
        <div className="flex items-center justify-center gap-2">
          <Zap size={12} className={isLight ? 'text-emerald-600' : 'text-emerald-400'} />
          <span className={`text-[10px] font-mono font-semibold tracking-wider ${
            isLight ? 'text-emerald-700' : 'text-emerald-400'
          }`}>
            KOSZT: $0.00
          </span>
        </div>
      </div>

      {/* Custom styles for animations */}
      <style>{`
        @keyframes pulse-glow-green {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          50% { box-shadow: 0 0 0 4px rgba(16, 185, 129, 0); }
        }

        @keyframes pulse-fast {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }

        .animate-pulse-glow-green {
          animation: pulse-glow-green 2s ease-in-out infinite;
        }

        .animate-pulse-fast {
          animation: pulse-fast 0.8s ease-in-out infinite;
        }

        .animate-slide-in {
          animation: slide-in 0.3s ease-out forwards;
        }

        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default OllamaStatus;
