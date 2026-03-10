// src/components/organisms/StatusFooter.tsx
/** Jaskier Design System */
/**
 * StatusFooter - Compact status bar
 * ==================================
 * Displays: version, connection status, model tier, CPU%, RAM%,
 * tagline, and live time.
 * Unified with GeminiHydra-v15 StatusFooter layout.
 *
 * Uses `memo()` for render optimization.
 */

import { cn } from '@jaskier/ui';
import { Cloud, Cpu, Zap } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusIndicator } from '@/components/molecules/StatusIndicator';
import { useTheme } from '@/contexts/ThemeContext';
import type { BrowserProxyStatus } from '@/features/settings/hooks/useBrowserProxy';
import { useBrowserProxyStatus } from '@/features/settings/hooks/useBrowserProxy';

// ============================================================================
// TYPES
// ============================================================================

type ConnectionHealth = 'connected' | 'degraded' | 'disconnected';

export interface StatusFooterProps {
  /** Connection health status */
  connectionHealth?: ConnectionHealth;
  /** Currently selected model name */
  selectedModel?: string;
  /** CPU usage percentage (0-100) */
  cpuUsage?: number;
  /** RAM usage percentage (0-100) */
  ramUsage?: number;
  /** Tagline displayed in the right section */
  tagline?: string;
  /** Whether stats are loaded (from backend) */
  statsLoaded?: boolean;
}

// ============================================================================
// BROWSER PROXY BADGE
// ============================================================================

type ProxyState = 'ready' | 'starting' | 'offline';

function getProxyState(status: BrowserProxyStatus): ProxyState {
  if (status.health?.ready) return 'ready';
  if (status.reachable) return 'starting';
  return 'offline';
}

const proxyDotColor: Record<ProxyState, string> = {
  ready: 'bg-emerald-500',
  starting: 'bg-amber-500',
  offline: 'bg-red-500',
};

const proxyLabelKey: Record<ProxyState, string> = {
  ready: 'footer.proxyReady',
  starting: 'footer.proxyStarting',
  offline: 'footer.proxyOffline',
};

function BrowserProxyBadge({ status }: { status: BrowserProxyStatus }) {
  const { t } = useTranslation();
  const state = getProxyState(status);
  const h = status.health;
  const shouldPulse = state === 'ready' && (h?.workers_busy ?? 0) > 0;

  const tooltipLines = h
    ? [
        `Workers: ${String(h.workers_ready)}/${String(h.pool_size)} ready`,
        `Busy: ${String(h.workers_busy)}`,
        `Queue: ${String(h.queue_length)}`,
        `Requests: ${String(h.total_requests)}`,
        `Errors: ${String(h.total_errors)}`,
        ...(status.error ? [`Error: ${status.error}`] : []),
      ]
    : [`Status: ${state}`, ...(status.error ? [`Error: ${status.error}`] : [])];

  return (
    <div className="inline-flex items-center gap-1.5 cursor-default" title={tooltipLines.join('\n')}>
      <span className="relative flex items-center justify-center">
        <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', proxyDotColor[state])} />
        {shouldPulse && (
          <span className={cn('absolute h-1.5 w-1.5 rounded-full animate-ping opacity-75', proxyDotColor[state])} />
        )}
      </span>
      <span className="text-[10px] font-mono leading-none text-inherit opacity-70">{t(proxyLabelKey[state])}</span>
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

function StatusFooterComponent({
  connectionHealth = 'connected',
  selectedModel = 'Claude Sonnet 4',
  cpuUsage = 12,
  ramUsage = 45,
  tagline,
  statsLoaded = true,
}: StatusFooterProps) {
  const { t } = useTranslation();
  const resolvedTagline = tagline ?? t('footer.statusTagline', 'AI Swarm Control Center');
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const { data: proxyStatus } = useBrowserProxyStatus(true);

  // Live time
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('pl-PL', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Connection status mapping
  const healthMap: Record<ConnectionHealth, { status: 'online' | 'pending' | 'offline'; label: string }> = {
    connected: { status: 'online', label: 'Online' },
    degraded: { status: 'pending', label: 'Degraded' },
    disconnected: { status: 'offline', label: 'Offline' },
  };

  const health = healthMap[connectionHealth];

  // Detect model tier (adapted for Claude models)
  const modelLower = selectedModel.toLowerCase();
  const modelTier = (() => {
    if (modelLower.includes('opus') || modelLower.includes('pro')) {
      return { label: 'PRO', icon: Cloud, cls: isLight ? 'text-blue-600' : 'text-blue-400' };
    }
    if (modelLower.includes('sonnet') || modelLower.includes('flash')) {
      return { label: 'FLASH', icon: Zap, cls: isLight ? 'text-amber-600' : 'text-amber-400' };
    }
    if (modelLower.includes('haiku') || modelLower.includes('qwen') || modelLower.includes('llama')) {
      return { label: 'LOCAL', icon: Cpu, cls: isLight ? 'text-emerald-600' : 'text-emerald-400' };
    }
    return null;
  })();

  // CPU color based on usage
  const cpuColor =
    cpuUsage > 80 ? 'text-red-400' : cpuUsage > 50 ? 'text-yellow-400' : isLight ? 'text-sky-600' : 'text-sky-400';

  // RAM color based on usage
  const ramColor =
    ramUsage > 85
      ? 'text-red-400'
      : ramUsage > 65
        ? 'text-yellow-400'
        : isLight
          ? 'text-violet-600'
          : 'text-violet-400';

  const dividerCls = isLight ? 'text-slate-300' : 'text-white/30';

  return (
    <footer
      data-testid="status-footer"
      className={cn(
        'px-6 py-2.5 border-t text-sm flex items-center justify-between shrink-0 transition-all duration-500',
        isLight ? 'border-slate-200/30 bg-white/40 text-slate-600' : 'border-white/10 bg-black/20 text-slate-300',
      )}
    >
      {/* Left: Version + Connection + CPU + RAM + Proxy */}
      <div className="flex items-center gap-4">
        {/* Version */}
        <span className={isLight ? 'text-emerald-600' : 'text-white'}>v4.0.0</span>

        <span className={dividerCls}>|</span>

        {/* Connection Status */}
        <StatusIndicator status={health.status} size="sm" label={health.label} />

        {/* CPU & RAM stats */}
        {statsLoaded && (
          <>
            <span className={dividerCls}>|</span>

            <span className={cn('font-semibold', cpuColor)} title={`CPU: ${cpuUsage}%`}>
              CPU {cpuUsage}%
            </span>

            <span className={cn('font-semibold', ramColor)} title={`RAM: ${ramUsage}%`}>
              RAM {ramUsage}%
            </span>
          </>
        )}

        {/* Browser Proxy status — only shown when configured */}
        {proxyStatus?.configured && (
          <>
            <span className={dividerCls}>|</span>
            <BrowserProxyBadge status={proxyStatus} />
          </>
        )}
      </div>

      {/* Right: Model + Tier + Tagline + Date + Time */}
      <div className="flex items-center gap-4">
        {/* Model tier badge */}
        {modelTier && (
          <div className={cn('flex items-center gap-1', modelTier.cls)}>
            <modelTier.icon size={10} aria-hidden="true" />
            <span className="font-bold">{modelTier.label}</span>
          </div>
        )}

        {/* Model name */}
        <span className={isLight ? 'text-slate-700' : 'text-white/50'}>{selectedModel}</span>

        <span className={dividerCls}>|</span>

        {/* Tagline */}
        <span title={t('footer.statusTagline', 'AI Swarm Control Center')}>{resolvedTagline}</span>

        <span className={dividerCls}>|</span>

        {/* Date */}
        <span>
          {new Date().toLocaleDateString('pl-PL', {
            weekday: 'short',
            day: 'numeric',
            month: '2-digit',
            year: 'numeric',
          })}
        </span>

        <span className={dividerCls}>|</span>

        {/* Live time */}
        <span className={cn('font-mono font-semibold tabular-nums', isLight ? 'text-emerald-600' : 'text-white')}>
          {currentTime}
        </span>
      </div>
    </footer>
  );
}

export const StatusFooter = memo(StatusFooterComponent);
StatusFooter.displayName = 'StatusFooter';
