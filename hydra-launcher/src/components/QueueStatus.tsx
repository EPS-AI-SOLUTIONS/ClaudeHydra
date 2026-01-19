import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useTabContext } from '../contexts/TabContext';
import { Clock, CheckCircle, XCircle, Loader2, List } from 'lucide-react';

const QueueStatus: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const { queueStats, isProcessing } = useTabContext();

  if (!queueStats) {
    return null;
  }

  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className={`rounded-lg border p-3 ${
      isLight
        ? 'bg-white/60 border-gray-200'
        : 'bg-gray-900/60 border-gray-800'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <List size={14} className={isLight ? 'text-blue-600' : 'text-blue-400'} />
          <span className={`text-xs font-semibold tracking-wider ${
            isLight ? 'text-gray-700' : 'text-gray-300'
          }`}>
            KOLEJKA
          </span>
        </div>
        {isProcessing && (
          <Loader2 size={14} className="animate-spin text-amber-500" />
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Queued */}
        <div className={`flex items-center gap-2 p-2 rounded ${
          isLight ? 'bg-gray-50' : 'bg-gray-800/50'
        }`}>
          <Clock size={12} className={isLight ? 'text-blue-500' : 'text-blue-400'} />
          <div>
            <div className={`text-lg font-bold ${
              isLight ? 'text-gray-800' : 'text-gray-200'
            }`}>
              {queueStats.totalQueued}
            </div>
            <div className={`text-[9px] ${
              isLight ? 'text-gray-500' : 'text-gray-500'
            }`}>
              W kolejce
            </div>
          </div>
        </div>

        {/* Processing */}
        <div className={`flex items-center gap-2 p-2 rounded ${
          isLight ? 'bg-amber-50' : 'bg-amber-900/20'
        }`}>
          <Loader2 size={12} className={`${
            queueStats.processing > 0 ? 'animate-spin' : ''
          } ${isLight ? 'text-amber-500' : 'text-amber-400'}`} />
          <div>
            <div className={`text-lg font-bold ${
              isLight ? 'text-amber-700' : 'text-amber-300'
            }`}>
              {queueStats.processing}
            </div>
            <div className={`text-[9px] ${
              isLight ? 'text-amber-600' : 'text-amber-500'
            }`}>
              Przetwarzane
            </div>
          </div>
        </div>

        {/* Completed Today */}
        <div className={`flex items-center gap-2 p-2 rounded ${
          isLight ? 'bg-emerald-50' : 'bg-emerald-900/20'
        }`}>
          <CheckCircle size={12} className={isLight ? 'text-emerald-500' : 'text-emerald-400'} />
          <div>
            <div className={`text-lg font-bold ${
              isLight ? 'text-emerald-700' : 'text-emerald-300'
            }`}>
              {queueStats.completedToday}
            </div>
            <div className={`text-[9px] ${
              isLight ? 'text-emerald-600' : 'text-emerald-500'
            }`}>
              Ukończone
            </div>
          </div>
        </div>

        {/* Failed Today */}
        <div className={`flex items-center gap-2 p-2 rounded ${
          isLight ? 'bg-red-50' : 'bg-red-900/20'
        }`}>
          <XCircle size={12} className={isLight ? 'text-red-500' : 'text-red-400'} />
          <div>
            <div className={`text-lg font-bold ${
              isLight ? 'text-red-700' : 'text-red-300'
            }`}>
              {queueStats.failedToday}
            </div>
            <div className={`text-[9px] ${
              isLight ? 'text-red-600' : 'text-red-500'
            }`}>
              Błędy
            </div>
          </div>
        </div>
      </div>

      {/* Average Times */}
      {(queueStats.averageWaitMs > 0 || queueStats.averageProcessMs > 0) && (
        <div className={`mt-3 pt-2 border-t ${
          isLight ? 'border-gray-200' : 'border-gray-700'
        }`}>
          <div className="flex justify-between text-[10px]">
            <span className={isLight ? 'text-gray-500' : 'text-gray-500'}>
              Śr. oczekiwanie:
            </span>
            <span className={isLight ? 'text-gray-700' : 'text-gray-300'}>
              {formatTime(queueStats.averageWaitMs)}
            </span>
          </div>
          <div className="flex justify-between text-[10px] mt-1">
            <span className={isLight ? 'text-gray-500' : 'text-gray-500'}>
              Śr. przetwarzanie:
            </span>
            <span className={isLight ? 'text-gray-700' : 'text-gray-300'}>
              {formatTime(queueStats.averageProcessMs)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueueStatus;
