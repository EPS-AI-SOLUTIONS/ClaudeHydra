/**
 * ConnectionStatusBadge — Small inline indicator for WebSocket connection state.
 *
 * Shows a colored dot + label in the ChatHeader to give users live feedback
 * on the WebSocket connection. When the connection has given up after all
 * retry attempts, a manual "Reconnect" button is shown.
 */

import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { motion } from 'motion/react';
import { memo } from 'react';
import type { ConnectionStatus } from '@/shared/hooks/useWebSocketChat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectionStatusBadgeProps {
  /** Current WebSocket connection status. */
  connectionStatus: ConnectionStatus;
  /** Whether reconnection has been exhausted. */
  connectionGaveUp: boolean;
  /** Callback to manually trigger reconnection. */
  onReconnect: () => void;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<ConnectionStatus, { color: string; label: string; dotClass: string }> = {
  connected: {
    color: 'text-emerald-400',
    label: 'WS Connected',
    dotClass: 'bg-emerald-400',
  },
  reconnecting: {
    color: 'text-amber-400',
    label: 'Reconnecting...',
    dotClass: 'bg-amber-400',
  },
  disconnected: {
    color: 'text-red-400',
    label: 'WS Disconnected',
    dotClass: 'bg-red-400',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ConnectionStatusBadge = memo(function ConnectionStatusBadge({
  connectionStatus,
  connectionGaveUp,
  onReconnect,
}: ConnectionStatusBadgeProps) {
  const config = STATUS_CONFIG[connectionStatus];

  // Don't show the badge when connected (clean header)
  if (connectionStatus === 'connected') {
    return (
      <div className="flex items-center gap-1.5" title="WebSocket connected">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
        <Wifi size={12} className={config.color} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex items-center gap-1.5 text-xs font-mono ${config.color}`}
      title={connectionGaveUp ? 'Connection failed — click to retry' : config.label}
    >
      {/* Animated dot for reconnecting */}
      {connectionStatus === 'reconnecting' ? (
        <motion.span
          className={`inline-block w-1.5 h-1.5 rounded-full ${config.dotClass}`}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      ) : (
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      )}

      {connectionStatus === 'reconnecting' ? (
        <RefreshCw size={12} className="animate-spin" />
      ) : (
        <WifiOff size={12} />
      )}

      <span>{config.label}</span>

      {/* Manual reconnect button when all attempts exhausted */}
      {connectionGaveUp && (
        <button
          type="button"
          onClick={onReconnect}
          className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-red-400/20 hover:bg-red-400/30 transition-colors"
        >
          Retry
        </button>
      )}
    </motion.div>
  );
});

ConnectionStatusBadge.displayName = 'ConnectionStatusBadge';
