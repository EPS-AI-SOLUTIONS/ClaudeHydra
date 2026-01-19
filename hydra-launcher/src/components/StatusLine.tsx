import React, { useState, useEffect } from 'react';
import { Cpu, HardDrive, Wifi, WifiOff, Clock, Zap, Shield, Server, Activity } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { safeInvoke, isTauri } from '../hooks/useTauri';

interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  memory_used_gb: number;
  memory_total_gb: number;
}

interface StatusLineProps {
  isConnected?: boolean;
  yoloEnabled?: boolean;
  mcpOnline?: number;
  mcpTotal?: number;
}

const StatusLine: React.FC<StatusLineProps> = ({
  isConnected = false,
  yoloEnabled = true,
  mcpOnline = 0,
  mcpTotal = 3,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch system metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        if (isTauri()) {
          const data = await safeInvoke<SystemMetrics>('get_system_metrics');
          setMetrics(data);
        } else {
          // Mock data for browser
          setMetrics({
            cpu_percent: Math.random() * 40 + 20,
            memory_percent: Math.random() * 30 + 40,
            memory_used_gb: 8.5,
            memory_total_gb: 16,
          });
        }
      } catch (e) {
        console.error('Failed to fetch metrics:', e);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getCpuColor = (percent: number) => {
    if (percent > 80) return 'text-red-500';
    if (percent > 60) return 'text-amber-500';
    return 'text-emerald-500';
  };

  const getMemColor = (percent: number) => {
    if (percent > 85) return 'text-red-500';
    if (percent > 70) return 'text-amber-500';
    return 'text-emerald-500';
  };

  return (
    <div className={`w-full px-4 py-2 flex items-center justify-between border-t backdrop-blur-sm ${
      isLight
        ? 'bg-amber-50/80 border-amber-300/40 text-amber-800'
        : 'bg-black/60 border-amber-500/30 text-amber-200'
    }`}>
      {/* Left section - Connection & Mode */}
      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <Wifi size={12} className="text-emerald-500" />
          ) : (
            <WifiOff size={12} className="text-red-500" />
          )}
          <span className={`text-[9px] font-cinzel tracking-wider ${
            isConnected ? 'text-emerald-500' : 'text-red-500'
          }`}>
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        {/* Separator */}
        <span className={`text-[10px] ${isLight ? 'text-amber-400/40' : 'text-amber-600/40'}`}>│</span>

        {/* YOLO status */}
        <div className="flex items-center gap-1.5">
          {yoloEnabled ? (
            <Zap size={12} className="text-amber-500" />
          ) : (
            <Shield size={12} className="text-slate-500" />
          )}
          <span className={`text-[9px] font-cinzel tracking-wider ${
            yoloEnabled ? 'text-amber-500' : 'text-slate-500'
          }`}>
            {yoloEnabled ? 'YOLO' : 'SAFE'}
          </span>
        </div>

        {/* Separator */}
        <span className={`text-[10px] ${isLight ? 'text-amber-400/40' : 'text-amber-600/40'}`}>│</span>

        {/* MCP status */}
        <div className="flex items-center gap-1.5">
          <Server size={12} className={mcpOnline > 0 ? 'text-emerald-500' : 'text-red-500'} />
          <span className={`text-[9px] font-cinzel tracking-wider ${
            mcpOnline === mcpTotal ? 'text-emerald-500' :
            mcpOnline > 0 ? 'text-amber-500' : 'text-red-500'
          }`}>
            MCP {mcpOnline}/{mcpTotal}
          </span>
        </div>
      </div>

      {/* Center section - System metrics */}
      <div className="flex items-center gap-4">
        {metrics && (
          <>
            {/* CPU */}
            <div className="flex items-center gap-1.5">
              <Cpu size={12} className={getCpuColor(metrics.cpu_percent)} />
              <span className={`text-[9px] font-cinzel tracking-wider ${getCpuColor(metrics.cpu_percent)}`}>
                CPU {metrics.cpu_percent.toFixed(0)}%
              </span>
              <div className={`w-16 h-1.5 rounded-full overflow-hidden ${
                isLight ? 'bg-amber-200/50' : 'bg-amber-900/30'
              }`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    metrics.cpu_percent > 80 ? 'bg-red-500' :
                    metrics.cpu_percent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(metrics.cpu_percent, 100)}%` }}
                />
              </div>
            </div>

            {/* Separator */}
            <span className={`text-[10px] ${isLight ? 'text-amber-400/40' : 'text-amber-600/40'}`}>│</span>

            {/* Memory */}
            <div className="flex items-center gap-1.5">
              <HardDrive size={12} className={getMemColor(metrics.memory_percent)} />
              <span className={`text-[9px] font-cinzel tracking-wider ${getMemColor(metrics.memory_percent)}`}>
                RAM {metrics.memory_percent.toFixed(0)}%
              </span>
              <div className={`w-16 h-1.5 rounded-full overflow-hidden ${
                isLight ? 'bg-amber-200/50' : 'bg-amber-900/30'
              }`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    metrics.memory_percent > 85 ? 'bg-red-500' :
                    metrics.memory_percent > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(metrics.memory_percent, 100)}%` }}
                />
              </div>
              <span className={`text-[8px] font-cinzel ${
                isLight ? 'text-amber-600/60' : 'text-amber-500/50'
              }`}>
                {metrics.memory_used_gb.toFixed(1)}GB
              </span>
            </div>
          </>
        )}
      </div>

      {/* Right section - Time & Version */}
      <div className="flex items-center gap-4">
        {/* Activity indicator */}
        <div className="flex items-center gap-1">
          <Activity size={10} className={`${isLight ? 'text-amber-600/40' : 'text-amber-500/30'}`} />
          <span className={`text-[8px] font-cinzel tracking-wider ${
            isLight ? 'text-amber-600/50' : 'text-amber-500/40'
          }`}>
            ᚠ ᚢ ᚦ
          </span>
        </div>

        {/* Separator */}
        <span className={`text-[10px] ${isLight ? 'text-amber-400/40' : 'text-amber-600/40'}`}>│</span>

        {/* Time */}
        <div className="flex items-center gap-1.5">
          <Clock size={12} className={isLight ? 'text-amber-600/60' : 'text-amber-500/50'} />
          <span className={`text-[10px] font-cinzel tracking-wider ${
            isLight ? 'text-amber-700' : 'text-amber-400'
          }`}>
            {formatTime(currentTime)}
          </span>
        </div>

        {/* Separator */}
        <span className={`text-[10px] ${isLight ? 'text-amber-400/40' : 'text-amber-600/40'}`}>│</span>

        {/* Version */}
        <span className={`text-[9px] font-cinzel font-semibold tracking-wider ${
          isLight ? 'text-amber-600/70' : 'text-amber-500/60'
        }`}>
          HYDRA 10.6.1
        </span>
      </div>
    </div>
  );
};

export default StatusLine;
