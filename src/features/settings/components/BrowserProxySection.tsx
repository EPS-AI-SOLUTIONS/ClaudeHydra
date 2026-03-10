/** Jaskier Shared Pattern — Browser Proxy Login Section (Settings) */

import { cn } from '@jaskier/ui';
import { AlertTriangle, CheckCircle, Globe, Loader2, LogIn, LogOut, Power, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button } from '@/components/atoms';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import {
  useBrowserProxyLogin,
  useBrowserProxyLogout,
  useBrowserProxyReinit,
  useBrowserProxyStatus,
} from '../hooks/useBrowserProxy';

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

function formatAge(
  t: (key: string, opts?: Record<string, unknown>) => string,
  seconds: number | null | undefined,
): string {
  if (seconds == null) return t('settings.browserProxy.unknown');
  if (seconds < 60) return t('settings.browserProxy.secondsAgo', { count: seconds });
  if (seconds < 3600) return t('settings.browserProxy.minutesAgo', { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return t('settings.browserProxy.hoursAgo', { count: Math.floor(seconds / 3600) });
  return t('settings.browserProxy.daysAgo', { count: Math.floor(seconds / 86400) });
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
      toast.success(t('settings.browserProxy.loginStarted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.browserProxy.loginFailed'));
    }
  }, [loginMutation, t]);

  const handleReinit = useCallback(async () => {
    try {
      await reinitMutation.mutateAsync();
      toast.success(t('settings.browserProxy.reinitSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.browserProxy.reinitFailed'));
    }
  }, [reinitMutation, t]);

  const handleLogout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
      toast.success(t('settings.browserProxy.logoutSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.browserProxy.logoutFailed'));
    }
  }, [logoutMutation, t]);

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
        <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
          {t('settings.browserProxy.title')}
        </h3>
      </div>

      <p className={cn('text-xs', theme.textMuted)}>{t('settings.browserProxy.description')}</p>

      {isLoading ? (
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-[var(--matrix-accent)]" />
          <span className={cn('text-xs', theme.textMuted)}>{t('settings.browserProxy.checking')}</span>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {/* -- Not Configured -- */}
          {phase === 'not_configured' && (
            <motion.div key="not-configured" {...phaseVariants} className="space-y-2">
              <div className="flex items-center gap-2 text-zinc-500">
                <Power size={14} />
                <span className="text-xs font-mono">{t('settings.browserProxy.notConfigured')}</span>
              </div>
              <p className={cn('text-xs', theme.textMuted)}>
                {t('settings.browserProxy.notConfiguredHint')
                  .split('<code>')
                  .map((part, i) => {
                    if (i === 0) return part;
                    const [code, rest] = part.split('</code>');
                    return (
                      <span key={code}>
                        <code className="text-[var(--matrix-accent)]">{code}</code>
                        {rest}
                      </span>
                    );
                  })}
              </p>
            </motion.div>
          )}

          {/* -- Unreachable -- */}
          {phase === 'unreachable' && (
            <motion.div key="unreachable" {...phaseVariants} className="space-y-2">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle size={14} />
                <span className="text-xs font-mono">{t('settings.browserProxy.unreachable')}</span>
              </div>
              <p className={cn('text-xs', theme.textMuted)}>
                {t('settings.browserProxy.unreachableHint', { url: status?.proxy_url })
                  .split('<code>')
                  .map((part, i) => {
                    if (i === 0) return part;
                    const [code, rest] = part.split('</code>');
                    return (
                      <span key={code}>
                        <code className="text-[var(--matrix-accent)]">{code}</code>
                        {rest}
                      </span>
                    );
                  })}
              </p>
            </motion.div>
          )}

          {/* -- Logging In -- */}
          {phase === 'logging_in' && (
            <motion.div key="logging-in" {...phaseVariants} className="space-y-3">
              <div className="flex items-center gap-2 text-amber-400">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs font-mono font-medium">{t('settings.browserProxy.loggingIn')}</span>
              </div>
              <p className={cn('text-xs', theme.textMuted)}>{t('settings.browserProxy.loggingInHint')}</p>
              {status?.login?.last_login_error && (
                <div className="flex items-center gap-2 text-red-400">
                  <AlertTriangle size={14} />
                  <span className="text-xs">{status.login.last_login_error}</span>
                </div>
              )}
            </motion.div>
          )}

          {/* -- Not Logged In -- */}
          {phase === 'not_logged_in' && (
            <motion.div key="not-logged-in" {...phaseVariants} className="space-y-3">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle size={14} />
                <span className="text-xs font-mono">{t('settings.browserProxy.notLoggedIn')}</span>
              </div>
              <p className={cn('text-xs', theme.textMuted)}>{t('settings.browserProxy.notLoggedInHint')}</p>
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
                {t('settings.browserProxy.loginToGoogle')}
              </Button>
            </motion.div>
          )}

          {/* -- Connected -- */}
          {phase === 'connected' && (
            <motion.div key="connected" {...phaseVariants} className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="accent" size="sm" icon={<CheckCircle size={12} />}>
                  {ready ? t('settings.browserProxy.ready') : t('settings.browserProxy.loggedIn')}
                </Badge>
                <span className={cn('text-xs font-mono', theme.textMuted)}>
                  {t('settings.browserProxy.workers', { ready: workersReady, total: poolSize })}
                </span>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2">
                <StatItem
                  label={t('settings.browserProxy.uptime')}
                  value={formatUptime(status?.health?.uptime_seconds ?? 0)}
                  theme={theme}
                />
                <StatItem
                  label={t('settings.browserProxy.requests')}
                  value={String(status?.health?.total_requests ?? 0)}
                  theme={theme}
                />
                <StatItem
                  label={t('settings.browserProxy.authAge')}
                  value={formatAge(t, status?.login?.auth_file_age_seconds)}
                  theme={theme}
                />
              </div>

              {(status?.health?.total_errors ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-amber-400">
                  <AlertTriangle size={12} />
                  <span className="text-[10px] font-mono">
                    {t('settings.browserProxy.errors', { count: status?.health?.total_errors })}
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
                  {t('settings.browserProxy.reinitWorkers')}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<LogOut size={14} />}
                  onClick={handleLogout}
                  isLoading={logoutMutation.isPending}
                >
                  {t('settings.browserProxy.logout')}
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

// -- Small stat item --

const StatItem = memo(({ label, value, theme }: { label: string; value: string; theme: { textMuted: string } }) => (
  <div className="rounded-lg bg-[var(--matrix-glass)] px-2.5 py-1.5">
    <div className={cn('text-[10px] font-mono', theme.textMuted)}>{label}</div>
    <div className="text-xs font-mono font-medium text-[var(--matrix-accent)]">{value}</div>
  </div>
));

StatItem.displayName = 'StatItem';
