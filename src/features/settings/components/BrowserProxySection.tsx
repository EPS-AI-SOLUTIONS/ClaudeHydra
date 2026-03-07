/** Jaskier Shared Pattern — Browser Proxy Login Section (Settings) */

import {
  AlertTriangle,
  CheckCircle,
  Globe,
  Loader2,
  LogIn,
  LogOut,
  Power,
  RefreshCw,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Badge, Button } from '@/components/atoms';
import {
  useBrowserProxyStatus,
  useBrowserProxyLogin,
  useBrowserProxyReinit,
  useBrowserProxyLogout,
} from '../hooks/useBrowserProxy';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';

const phaseVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatAge(seconds: number | null | undefined): string {
  if (seconds == null) return 'unknown';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export const BrowserProxySection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const [polling, setPolling] = useState(false);

  const { data: status, isLoading } = useBrowserProxyStatus(polling);
  const loginMutation = useBrowserProxyLogin();
  const reinitMutation = useBrowserProxyReinit();
  const logoutMutation = useBrowserProxyLogout();

  const loginInProgress = status?.login?.login_in_progress ?? false;

  // Auto-poll during login
  useEffect(() => {
    if (loginInProgress) {
      setPolling(true);
    } else if (polling) {
      // Stop polling 2s after login completes
      const timer = setTimeout(() => setPolling(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [loginInProgress, polling]);

  const handleLogin = useCallback(async () => {
    try {
      setPolling(true);
      await loginMutation.mutateAsync();
      toast.success('Login started — complete Google login in the browser window');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    }
  }, [loginMutation]);

  const handleReinit = useCallback(async () => {
    try {
      await reinitMutation.mutateAsync();
      toast.success('Workers reinitialized');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reinit failed');
    }
  }, [reinitMutation]);

  const handleLogout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
      toast.success('Logged out from browser proxy');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Logout failed');
    }
  }, [logoutMutation]);

  // Determine display state
  const configured = status?.configured ?? false;
  const reachable = status?.reachable ?? false;
  const loggedIn = status?.health?.logged_in ?? false;
  const ready = status?.health?.ready ?? false;
  const workersReady = status?.health?.workers_ready ?? 0;
  const poolSize = status?.health?.pool_size ?? 0;

  const phase = !configured
    ? 'not_configured'
    : !reachable
      ? 'unreachable'
      : loginInProgress
        ? 'logging_in'
        : !loggedIn
          ? 'not_logged_in'
          : 'connected';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Globe size={18} className="text-[var(--matrix-accent)]" />
        <h3
          className={cn(
            'text-sm font-semibold font-mono uppercase tracking-wider',
            theme.text,
          )}
        >
          Browser Proxy
        </h3>
      </div>

      <p className={cn('text-xs', theme.textMuted)}>
        Gemini image generation via browser automation (gemini-browser-proxy).
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-[var(--matrix-accent)]" />
          <span className={cn('text-xs', theme.textMuted)}>Checking proxy status...</span>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {/* ── Not Configured ── */}
          {phase === 'not_configured' && (
            <motion.div key="not-configured" {...phaseVariants} className="space-y-2">
              <div className="flex items-center gap-2 text-zinc-500">
                <Power size={14} />
                <span className="text-xs font-mono">Not configured</span>
              </div>
              <p className={cn('text-xs', theme.textMuted)}>
                Set <code className="text-[var(--matrix-accent)]">BROWSER_PROXY_URL</code> env
                var to enable.
              </p>
            </motion.div>
          )}

          {/* ── Unreachable ── */}
          {phase === 'unreachable' && (
            <motion.div key="unreachable" {...phaseVariants} className="space-y-2">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle size={14} />
                <span className="text-xs font-mono">Proxy unreachable</span>
              </div>
              <p className={cn('text-xs', theme.textMuted)}>
                Cannot connect to{' '}
                <code className="text-[var(--matrix-accent)]">{status?.proxy_url}</code>.
                Start the proxy first.
              </p>
            </motion.div>
          )}

          {/* ── Logging In ── */}
          {phase === 'logging_in' && (
            <motion.div key="logging-in" {...phaseVariants} className="space-y-3">
              <div className="flex items-center gap-2 text-amber-400">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs font-mono font-medium">
                  Login in progress...
                </span>
              </div>
              <p className={cn('text-xs', theme.textMuted)}>
                Complete Google login in the browser window that opened on the proxy machine.
              </p>
              {status?.login?.last_login_error && (
                <div className="flex items-center gap-2 text-red-400">
                  <AlertTriangle size={14} />
                  <span className="text-xs">{status.login.last_login_error}</span>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Not Logged In ── */}
          {phase === 'not_logged_in' && (
            <motion.div key="not-logged-in" {...phaseVariants} className="space-y-3">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle size={14} />
                <span className="text-xs font-mono">Not logged in</span>
              </div>
              <p className={cn('text-xs', theme.textMuted)}>
                Proxy is running but not authenticated. Login to Google to enable image
                generation.
              </p>
              {status?.login?.last_login_error && (
                <div className="flex items-center gap-2 text-red-400 mt-1">
                  <AlertTriangle size={14} />
                  <span className="text-xs">{status.login.last_login_error}</span>
                </div>
              )}
              <Button
                variant="primary"
                size="sm"
                leftIcon={<LogIn size={14} />}
                onClick={handleLogin}
                isLoading={loginMutation.isPending}
              >
                Login to Google
              </Button>
            </motion.div>
          )}

          {/* ── Connected ── */}
          {phase === 'connected' && (
            <motion.div key="connected" {...phaseVariants} className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  variant="accent"
                  size="sm"
                  icon={<CheckCircle size={12} />}
                >
                  {ready ? 'Ready' : 'Logged in'}
                </Badge>
                <span className={cn('text-xs font-mono', theme.textMuted)}>
                  {workersReady}/{poolSize} workers
                </span>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2">
                <StatItem
                  label="Uptime"
                  value={formatUptime(status?.health?.uptime_seconds ?? 0)}
                  theme={theme}
                />
                <StatItem
                  label="Requests"
                  value={String(status?.health?.total_requests ?? 0)}
                  theme={theme}
                />
                <StatItem
                  label="Auth age"
                  value={formatAge(status?.login?.auth_file_age_seconds)}
                  theme={theme}
                />
              </div>

              {(status?.health?.total_errors ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-amber-400">
                  <AlertTriangle size={12} />
                  <span className="text-[10px] font-mono">
                    {status?.health?.total_errors} errors
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<RefreshCw size={14} />}
                  onClick={handleReinit}
                  isLoading={reinitMutation.isPending}
                >
                  Reinit Workers
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<LogOut size={14} />}
                  onClick={handleLogout}
                  isLoading={logoutMutation.isPending}
                >
                  Logout
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
});

BrowserProxySection.displayName = 'BrowserProxySection';

// ── Small stat item ─────────────────────────────────────────────────────

const StatItem = memo(
  ({ label, value, theme }: { label: string; value: string; theme: { textMuted: string } }) => (
    <div className="rounded-lg bg-[var(--matrix-glass)] px-2.5 py-1.5">
      <div className={cn('text-[10px] font-mono', theme.textMuted)}>{label}</div>
      <div className="text-xs font-mono font-medium text-[var(--matrix-accent)]">{value}</div>
    </div>
  ),
);

StatItem.displayName = 'StatItem';
