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
    <div className={`w-full px-4 py-2 flex items-center justify-between border-t backdrop-blur-md relative overflow-hidden ${
      isLight
        ? 'border-gray-200/60 text-gray-800'
        : 'border-gray-800/60 text-gray-200'
    }`}>
      {/* Gradient background */}
      <div className={`absolute inset-0 ${
        isLight
          ? 'bg-gradient-to-r from-gray-50/90 via-white/90 to-gray-50/90'
          : 'bg-gradient-to-r from-gray-900/90 via-black/90 to-gray-900/90'
      }`} />

      {/* Subtle top highlight */}
      <div className={`absolute top-0 left-0 right-0 h-px ${
        isLight
          ? 'bg-gradient-to-r from-transparent via-gray-300/50 to-transparent'
          : 'bg-gradient-to-r from-transparent via-gray-700/50 to-transparent'
      }`} />

      {/* Left section - Connection & Mode */}
      <div className="flex items-center gap-4 relative z-10">
        {/* Connection status z animacja */}
        <div className="flex items-center gap-1.5 group">
          {isConnected ? (
            <Wifi size={12} className="text-emerald-500 transition-transform duration-200 group-hover:scale-110" />
          ) : (
            <WifiOff size={12} className="text-red-500 animate-pulse" />
          )}
          <span className={`text-[9px] font-mono tracking-wider transition-all duration-200 ${
            isConnected ? 'text-emerald-500' : 'text-red-500'
          }`}>
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
          {/* Status indicator dot */}
          <span className={`w-1.5 h-1.5 rounded-full ${
            isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
          }`} />
        </div>

        {/* Separator */}
        <span className={`text-[10px] ${isLight ? 'text-gray-300' : 'text-gray-700'}`}>|</span>

        {/* YOLO status z animacja */}
        <div className="flex items-center gap-1.5 group">
          {yoloEnabled ? (
            <Zap size={12} className="text-amber-500 transition-all duration-200 group-hover:scale-110 group-hover:rotate-12" />
          ) : (
            <Shield size={12} className="text-slate-500 transition-transform duration-200 group-hover:scale-110" />
          )}
          <span className={`text-[9px] font-mono tracking-wider transition-all duration-200 ${
            yoloEnabled ? 'text-amber-500' : 'text-slate-500'
          }`}>
            {yoloEnabled ? 'YOLO' : 'SAFE'}
          </span>
        </div>

        {/* Separator */}
        <span className={`text-[10px] ${isLight ? 'text-gray-300' : 'text-gray-700'}`}>|</span>

        {/* MCP status z animacja */}
        <div className="flex items-center gap-1.5 group">
          <Server size={12} className={`transition-all duration-200 group-hover:scale-110 ${
            mcpOnline > 0 ? 'text-emerald-500' : 'text-red-500'
          }`} />
          <span className={`text-[9px] font-mono tracking-wider transition-all duration-200 ${
            mcpOnline === mcpTotal ? 'text-emerald-500' :
            mcpOnline > 0 ? 'text-amber-500' : 'text-red-500'
          }`}>
            MCP {mcpOnline}/{mcpTotal}
          </span>
          {/* Mini progress indicator */}
          <div className={`flex gap-0.5`}>
            {Array.from({ length: mcpTotal }).map((_, i) => (
              <span
                key={i}
                className={`w-1 h-1 rounded-full transition-all duration-300 ${
                  i < mcpOnline ? 'bg-emerald-500' : isLight ? 'bg-gray-300' : 'bg-gray-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Center section - System metrics */}
      <div className="flex items-center gap-4 relative z-10">
        {metrics && (
          <>
            {/* CPU z ulepszona animacja */}
            <div className="flex items-center gap-1.5 group">
              <Cpu size={12} className={`transition-all duration-200 group-hover:scale-110 ${getCpuColor(metrics.cpu_percent)}`} />
              <span className={`text-[9px] font-mono tracking-wider transition-all duration-200 ${getCpuColor(metrics.cpu_percent)}`}>
                CPU {metrics.cpu_percent.toFixed(0)}%
              </span>
              <div className={`w-16 h-1.5 rounded-full overflow-hidden ${
                isLight ? 'bg-gray-200' : 'bg-gray-800'
              }`}>
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    metrics.cpu_percent > 80 ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]' :
                    metrics.cpu_percent > 60 ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]' :
                    'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.3)]'
                  }`}
                  style={{ width: `${Math.min(metrics.cpu_percent, 100)}%` }}
                />
              </div>
            </div>

            {/* Separator */}
            <span className={`text-[10px] ${isLight ? 'text-gray-300' : 'text-gray-700'}`}>|</span>

            {/* Memory z ulepszona animacja */}
            <div className="flex items-center gap-1.5 group">
              <HardDrive size={12} className={`transition-all duration-200 group-hover:scale-110 ${getMemColor(metrics.memory_percent)}`} />
              <span className={`text-[9px] font-mono tracking-wider transition-all duration-200 ${getMemColor(metrics.memory_percent)}`}>
                RAM {metrics.memory_percent.toFixed(0)}%
              </span>
              <div className={`w-16 h-1.5 rounded-full overflow-hidden ${
                isLight ? 'bg-gray-200' : 'bg-gray-800'
              }`}>
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    metrics.memory_percent > 85 ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]' :
                    metrics.memory_percent > 70 ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]' :
                    'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.3)]'
                  }`}
                  style={{ width: `${Math.min(metrics.memory_percent, 100)}%` }}
                />
              </div>
              <span className={`text-[8px] font-mono transition-opacity duration-200 group-hover:opacity-100 ${
                isLight ? 'text-gray-500 opacity-70' : 'text-gray-500 opacity-70'
              }`}>
                {metrics.memory_used_gb.toFixed(1)}GB
              </span>
            </div>
          </>
        )}
      </div>

      {/* Right section - Time & Version */}
      <div className="flex items-center gap-4 relative z-10">
        {/* Activity indicator z animacja */}
        <div className="flex items-center gap-1 group">
          <Activity size={10} className={`transition-all duration-200 group-hover:scale-110 ${
            isLight ? 'text-gray-400' : 'text-gray-600'
          }`} />
          <span className={`text-[8px] font-mono tracking-wider transition-opacity duration-200 group-hover:opacity-100 ${
            isLight ? 'text-gray-500 opacity-60' : 'text-gray-500 opacity-60'
          }`}>
            SYS
          </span>
        </div>

        {/* Separator */}
        <span className={`text-[10px] ${isLight ? 'text-gray-300' : 'text-gray-700'}`}>|</span>

        {/* Time z pulsujaxa sekunda */}
        <div className="flex items-center gap-1.5 group">
          <Clock size={12} className={`transition-all duration-200 group-hover:scale-110 ${
            isLight ? 'text-gray-500' : 'text-gray-500'
          }`} />
          <span className={`text-[10px] font-mono tracking-wider transition-all duration-200 ${
            isLight ? 'text-gray-700' : 'text-gray-300'
          }`}>
            {formatTime(currentTime)}
          </span>
        </div>

        {/* Separator */}
        <span className={`text-[10px] ${isLight ? 'text-gray-300' : 'text-gray-700'}`}>|</span>

        {/* Version z hover effect */}
        <span className={`text-[9px] font-mono font-semibold tracking-wider transition-all duration-200 hover:tracking-widest cursor-default ${
          isLight ? 'text-gray-600 hover:text-black' : 'text-gray-400 hover:text-white'
        }`}>
          REGIS 10.6.1
        </span>
      </div>
    </div>
  );
};

export default StatusLine;
