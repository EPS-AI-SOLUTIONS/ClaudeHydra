import React, { useState, useEffect, useRef } from 'react';
import { Server, CheckCircle2, XCircle, Loader2, RefreshCw, Activity, Zap, Clock } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useMCPHealth, type McpHealthResult } from '../hooks/useMCPHealth';

// Animated number component
const AnimatedNumber: React.FC<{ value: number; suffix?: string }> = ({ value, suffix = '' }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      const start = prevValue.current;
      const end = value;
      const duration = 500;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (end - start) * easeOut);
        setDisplayValue(current);

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
      prevValue.current = value;
    }
  }, [value]);

  return <span>{displayValue}{suffix}</span>;
};

// Mini bar chart for response time history
const MiniChart: React.FC<{ values: number[]; maxValue?: number; isLight: boolean }> = ({
  values,
  maxValue = Math.max(...values, 100),
  isLight
}) => {
  const barCount = Math.min(values.length, 8);
  const displayValues = values.slice(-barCount);

  return (
    <div className="flex items-end gap-0.5 h-4">
      {displayValues.map((val, i) => {
        const height = Math.max((val / maxValue) * 100, 10);
        const isLatest = i === displayValues.length - 1;
        return (
          <div
            key={i}
            className={`w-1 rounded-t transition-all duration-300 ${
              isLatest
                ? isLight ? 'bg-emerald-500' : 'bg-emerald-400'
                : isLight ? 'bg-gray-300' : 'bg-gray-600'
            }`}
            style={{
              height: `${height}%`,
              opacity: 0.4 + (i / displayValues.length) * 0.6
            }}
          />
        );
      })}
    </div>
  );
};

// Connection line with pulse animation
const ConnectionLine: React.FC<{ isActive: boolean; isLight: boolean }> = ({ isActive, isLight }) => (
  <div className="relative h-6 w-0.5 mx-auto">
    <div
      className={`absolute inset-0 rounded-full transition-all duration-500 ${
        isActive
          ? isLight ? 'bg-emerald-400' : 'bg-emerald-500'
          : isLight ? 'bg-gray-300' : 'bg-gray-700'
      }`}
    />
    {isActive && (
      <>
        <div
          className={`absolute inset-0 rounded-full animate-pulse ${
            isLight ? 'bg-emerald-400' : 'bg-emerald-500'
          }`}
          style={{ animationDuration: '1.5s' }}
        />
        <div
          className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
          style={{
            background: isLight
              ? 'radial-gradient(circle, rgba(52,211,153,0.8) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(52,211,153,0.6) 0%, transparent 70%)',
            animation: 'connectionPulse 2s ease-in-out infinite'
          }}
        />
      </>
    )}
  </div>
);

// Tooltip component
const Tooltip: React.FC<{ content: string; children: React.ReactNode }> = ({ content, children }) => {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap font-mono">
            {content}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
};

const MCPStatus: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const { health, isLoading, error, refresh, onlineCount, totalCount } = useMCPHealth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [responseHistory, setResponseHistory] = useState<Record<string, number[]>>({});

  // Track response time history
  useEffect(() => {
    const newHistory = { ...responseHistory };
    health.forEach(server => {
      if (server.response_time_ms) {
        if (!newHistory[server.name]) {
          newHistory[server.name] = [];
        }
        const history = newHistory[server.name];
        if (history[history.length - 1] !== server.response_time_ms) {
          newHistory[server.name] = [...history.slice(-7), server.response_time_ms];
        }
      }
    });
    setResponseHistory(newHistory);
  }, [health]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const getServerRune = (name: string) => {
    switch (name.toLowerCase()) {
      case 'serena':
        return 'ᚨ';
      case 'desktop commander':
        return 'ᚱ';
      case 'playwright':
        return 'ᚲ';
      default:
        return 'ᚷ';
    }
  };

  const getServerIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case 'serena':
        return Activity;
      case 'desktop commander':
        return Zap;
      case 'playwright':
        return Clock;
      default:
        return Server;
    }
  };

  return (
    <div className="glass-card p-5 relative overflow-hidden">
      {/* Animated background gradient for active state */}
      {onlineCount === totalCount && (
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 50% 0%, rgba(52,211,153,0.4) 0%, transparent 50%)'
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <span className={`text-lg transition-all duration-500 ${
            isLight ? 'text-gray-600' : 'text-gray-400'
          }`}>
            ᚠ
          </span>
          <Server className={`transition-colors duration-300 ${
            isLight ? 'text-gray-700' : 'text-gray-400'
          }`} size={16} />
          <h2 className="codex-header !border-0 !pb-0 !mb-0">
            SERWERY MCP
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Animated status counter */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-all duration-300 ${
            onlineCount === totalCount
              ? isLight
                ? 'bg-emerald-100 border border-emerald-300/50'
                : 'bg-emerald-900/30 border border-emerald-500/30'
              : isLight
                ? 'bg-amber-100 border border-amber-300/50'
                : 'bg-amber-900/30 border border-amber-500/30'
          }`}>
            {/* Animated status dot */}
            <div className="relative">
              <div className={`w-2 h-2 rounded-full ${
                onlineCount === totalCount
                  ? 'bg-emerald-500'
                  : 'bg-amber-500'
              }`} />
              <div
                className={`absolute inset-0 rounded-full animate-ping ${
                  onlineCount === totalCount
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
                }`}
                style={{ animationDuration: '2s' }}
              />
            </div>
            <span
              className={`text-[10px] font-mono font-semibold tracking-wider ${
                onlineCount === totalCount
                  ? isLight ? 'text-emerald-700' : 'text-emerald-400'
                  : isLight ? 'text-amber-700' : 'text-amber-400'
              }`}
            >
              <AnimatedNumber value={onlineCount} />/{totalCount}
            </span>
          </div>

          {/* Refresh button with gradient hover */}
          <Tooltip content="Odśwież status">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`relative p-2 rounded-lg transition-all duration-300 group overflow-hidden ${
                isLight
                  ? 'bg-gray-100 hover:bg-gray-200 border border-gray-200'
                  : 'bg-gray-800 hover:bg-gray-700 border border-gray-700'
              } ${isRefreshing ? 'cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
            >
              {/* Gradient overlay on hover */}
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                isLight
                  ? 'bg-gradient-to-br from-gray-200/50 to-transparent'
                  : 'bg-gradient-to-br from-gray-600/30 to-transparent'
              }`} />
              <RefreshCw
                size={14}
                className={`relative z-10 transition-all duration-300 ${
                  isRefreshing ? 'animate-spin' : 'group-hover:rotate-90'
                } ${isLight ? 'text-gray-600' : 'text-gray-400'}`}
              />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Decorative Divider */}
      <div className={`h-px mb-4 ${
        isLight
          ? 'bg-gradient-to-r from-transparent via-gray-300 to-transparent'
          : 'bg-gradient-to-r from-transparent via-gray-700 to-transparent'
      }`} />

      {/* Error State */}
      {error && (
        <div className={`text-[10px] mb-4 p-3 rounded-lg border font-mono animate-pulse ${
          isLight
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-red-900/20 text-red-400 border-red-500/30'
        }`}>
          <span className="mr-2">⚠</span>
          {error}
        </div>
      )}

      {/* Server List */}
      <div className="space-y-1">
        {isLoading && health.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="relative">
              <Loader2 className={`animate-spin ${isLight ? 'text-gray-400' : 'text-gray-600'}`} size={24} />
              <div className={`absolute inset-0 animate-ping ${isLight ? 'text-gray-300' : 'text-gray-700'}`}>
                <Loader2 size={24} />
              </div>
            </div>
            <span className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-600'}`}>
              Łączenie z serwerami...
            </span>
          </div>
        ) : (
          health.map((server, index) => (
            <React.Fragment key={server.name}>
              {index > 0 && (
                <ConnectionLine
                  isActive={server.status === 'online' && health[index - 1]?.status === 'online'}
                  isLight={isLight}
                />
              )}
              <ServerCard
                server={server}
                rune={getServerRune(server.name)}
                Icon={getServerIcon(server.name)}
                isLight={isLight}
                responseHistory={responseHistory[server.name] || []}
              />
            </React.Fragment>
          ))
        )}
      </div>

      {/* Add keyframes for animations */}
      <style>{`
        @keyframes connectionPulse {
          0%, 100% { transform: translate(-50%, 0) scale(1); opacity: 0.5; }
          50% { transform: translate(-50%, 0) scale(1.5); opacity: 0; }
        }
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes statusGlow {
          0%, 100% { box-shadow: 0 0 5px currentColor; }
          50% { box-shadow: 0 0 15px currentColor, 0 0 25px currentColor; }
        }
      `}</style>
    </div>
  );
};

const ServerCard: React.FC<{
  server: McpHealthResult;
  rune: string;
  Icon: React.FC<{ size?: number; className?: string }>;
  isLight: boolean;
  responseHistory: number[];
}> = ({ server, rune, Icon, isLight, responseHistory }) => {
  const isOnline = server.status === 'online';
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative rounded-lg transition-all duration-300 ${
        isHovered ? 'transform scale-[1.02]' : ''
      }`}
      style={{
        // Gradient border effect for active servers
        background: isOnline
          ? isLight
            ? 'linear-gradient(135deg, rgba(52,211,153,0.3) 0%, rgba(16,185,129,0.1) 100%)'
            : 'linear-gradient(135deg, rgba(52,211,153,0.15) 0%, rgba(16,185,129,0.05) 100%)'
          : 'transparent',
        padding: '1px',
      }}
    >
      <div
        className={`relative p-4 rounded-lg transition-all duration-300 ${
          isLight
            ? isOnline
              ? 'bg-white/90'
              : 'bg-red-50/90'
            : isOnline
              ? 'bg-gray-900/90'
              : 'bg-red-900/20'
        } ${isHovered ? 'shadow-lg' : ''}`}
        style={{
          boxShadow: isHovered
            ? isOnline
              ? isLight
                ? '0 10px 40px rgba(52,211,153,0.2), 0 0 0 1px rgba(52,211,153,0.3)'
                : '0 10px 40px rgba(52,211,153,0.1), 0 0 0 1px rgba(52,211,153,0.2)'
              : isLight
                ? '0 10px 40px rgba(239,68,68,0.2)'
                : '0 10px 40px rgba(239,68,68,0.1)'
            : undefined
        }}
      >
        {/* Content */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Rune with glow effect */}
            <div className="relative">
              <span
                className={`text-2xl transition-all duration-500 ${
                  isOnline
                    ? isLight ? 'text-emerald-600' : 'text-emerald-400'
                    : isLight ? 'text-gray-400' : 'text-gray-600'
                }`}
                style={isOnline && isHovered ? {
                  textShadow: isLight
                    ? '0 0 20px rgba(52,211,153,0.6)'
                    : '0 0 20px rgba(52,211,153,0.4)'
                } : {}}
              >
                {rune}
              </span>
              {/* Pulse ring on hover */}
              {isOnline && isHovered && (
                <div
                  className="absolute inset-0 rounded-full border-2 border-emerald-500/30 animate-ping"
                  style={{ animationDuration: '1.5s' }}
                />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className={`font-mono font-semibold text-sm tracking-wide ${
                  isLight ? 'text-gray-800' : 'text-gray-100'
                }`}>
                  {server.name}
                </span>
                <Icon
                  size={12}
                  className={`transition-colors duration-300 ${
                    isOnline
                      ? isLight ? 'text-emerald-500' : 'text-emerald-400'
                      : isLight ? 'text-gray-400' : 'text-gray-600'
                  }`}
                />
              </div>
              <div className={`text-[10px] font-mono flex items-center gap-2 ${
                isLight ? 'text-gray-500' : 'text-gray-500'
              }`}>
                <span>Port {server.port}</span>
                {server.response_time_ms && (
                  <>
                    <span className={isLight ? 'text-gray-300' : 'text-gray-700'}>|</span>
                    <Tooltip content={`Avg: ${Math.round(responseHistory.reduce((a, b) => a + b, 0) / responseHistory.length || server.response_time_ms)}ms`}>
                      <span className={`cursor-help ${
                        server.response_time_ms < 100
                          ? isLight ? 'text-emerald-600' : 'text-emerald-400'
                          : server.response_time_ms < 500
                            ? isLight ? 'text-amber-600' : 'text-amber-400'
                            : isLight ? 'text-red-600' : 'text-red-400'
                      }`}>
                        <AnimatedNumber value={server.response_time_ms} suffix="ms" />
                      </span>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mini chart */}
            {responseHistory.length > 1 && (
              <Tooltip content="Historia odpowiedzi">
                <div className={`p-1.5 rounded transition-all duration-300 ${
                  isHovered
                    ? isLight ? 'bg-gray-100' : 'bg-gray-800'
                    : ''
                }`}>
                  <MiniChart values={responseHistory} isLight={isLight} />
                </div>
              </Tooltip>
            )}

            {/* Status indicator */}
            <div className="relative">
              {isOnline ? (
                <div className="relative">
                  <CheckCircle2
                    className={`transition-all duration-300 ${
                      isLight ? 'text-emerald-500' : 'text-emerald-400'
                    }`}
                    size={20}
                    strokeWidth={1.5}
                  />
                  {/* Animated ring */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      animation: isHovered ? 'statusGlow 2s ease-in-out infinite' : 'none',
                      color: isLight ? 'rgba(52,211,153,0.4)' : 'rgba(52,211,153,0.3)'
                    }}
                  />
                </div>
              ) : (
                <XCircle
                  className={`transition-all duration-300 ${
                    isLight ? 'text-red-500' : 'text-red-400'
                  } ${isHovered ? 'animate-pulse' : ''}`}
                  size={20}
                  strokeWidth={1.5}
                />
              )}
            </div>
          </div>
        </div>

        {/* Hover shine effect */}
        {isHovered && isOnline && (
          <div
            className="absolute inset-0 rounded-lg pointer-events-none overflow-hidden"
            style={{
              background: `linear-gradient(105deg, transparent 40%, ${
                isLight ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.05)'
              } 45%, transparent 50%)`,
              animation: 'shine 1.5s ease-in-out infinite'
            }}
          />
        )}
      </div>
    </div>
  );
};

export default MCPStatus;
