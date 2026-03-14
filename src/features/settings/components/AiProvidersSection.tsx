/** Jaskier Shared Pattern — Unified AI Providers Management Section */

import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Shield,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button } from '@/components/atoms';
import { apiGet, apiPost } from '@/shared/api/client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProviderInfo {
  provider: string;
  plan_name: string;
  auth_type: string;
  is_connected: boolean;
  plan_tier: string | null;
  monthly_cost_cents: number;
  last_verified: string | null;
  last_error: string | null;
}

type AuthStatus = 'connected' | 'disconnected' | 'expiring' | 'error';

// ── Constants ──────────────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { icon: string; color: string; accent: string }> = {
  anthropic: { icon: '\u{1F7E3}', color: 'text-purple-400', accent: 'border-purple-500/30' },
  openai: { icon: '\u{1F7E2}', color: 'text-green-400', accent: 'border-green-500/30' },
  google: { icon: '\u{1F535}', color: 'text-blue-400', accent: 'border-blue-500/30' },
  xai: { icon: '\u26A1', color: 'text-yellow-400', accent: 'border-yellow-500/30' },
  deepseek: { icon: '\u{1F537}', color: 'text-cyan-400', accent: 'border-cyan-500/30' },
  ollama: { icon: '\u{1F999}', color: 'text-orange-400', accent: 'border-orange-500/30' },
};

const cardVariants = {
  initial: { opacity: 0, scale: 0.95, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, scale: 0.95, y: -8, transition: { duration: 0.15 } },
};

const STATUS_BADGE: Record<AuthStatus, { variant: 'accent' | 'default' | 'error'; color: string }> = {
  connected: { variant: 'accent', color: 'text-emerald-400' },
  disconnected: { variant: 'default', color: 'text-zinc-500' },
  expiring: { variant: 'default', color: 'text-amber-400' },
  error: { variant: 'error', color: 'text-red-400' },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getAuthStatus(p: ProviderInfo): AuthStatus {
  if (p.last_error) return 'error';
  if (!p.is_connected) return 'disconnected';
  if (p.last_verified) {
    const verified = new Date(p.last_verified).getTime();
    const hourAgo = Date.now() - 60 * 60 * 1000;
    if (verified < hourAgo) return 'expiring';
  }
  return 'connected';
}

function formatCost(cents: number): string {
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(0)}/mo`;
}

function formatVerified(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString();
}

function getMeta(provider: string) {
  return (
    PROVIDER_META[provider.toLowerCase()] ?? { icon: '\u{1F916}', color: 'text-zinc-400', accent: 'border-zinc-500/30' }
  );
}

// ── ProviderCard ───────────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: ProviderInfo;
  onConnect: (provider: string) => void;
  onDisconnect: (provider: string) => void;
  onTest: (provider: string) => void;
  isConnecting: boolean;
  isDisconnecting: boolean;
  isTesting: boolean;
}

const ProviderCard = memo<ProviderCardProps>(
  ({ provider: p, onConnect, onDisconnect, onTest, isConnecting, isDisconnecting, isTesting }) => {
    const { t } = useTranslation();
    const theme = useViewTheme();
    const meta = getMeta(p.provider);
    const status = getAuthStatus(p);
    const badge = STATUS_BADGE[status];

    const [confirmDisconnect, setConfirmDisconnect] = useState(false);

    const handleDisconnect = useCallback(() => {
      if (!confirmDisconnect) {
        setConfirmDisconnect(true);
        setTimeout(() => setConfirmDisconnect(false), 3000);
        return;
      }
      setConfirmDisconnect(false);
      onDisconnect(p.provider);
    }, [confirmDisconnect, onDisconnect, p.provider]);

    return (
      <motion.div
        layout
        variants={cardVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className={cn(
          'relative rounded-lg border p-4 space-y-3',
          'bg-[var(--matrix-glass)] backdrop-blur-sm',
          'transition-colors duration-200',
          meta.accent,
          p.is_connected && 'ring-1 ring-emerald-500/20',
        )}
      >
        {/* Header: Icon + Name + Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl leading-none flex-shrink-0" role="img" aria-label={p.provider}>
              {meta.icon}
            </span>
            <div className="min-w-0">
              <h4 className={cn('text-sm font-semibold font-mono truncate', theme.text)}>{p.plan_name}</h4>
              <span className={cn('text-[10px] font-mono uppercase tracking-wider', theme.textMuted)}>
                {p.provider}
              </span>
            </div>
          </div>

          <Badge
            variant={badge.variant}
            size="sm"
            icon={
              status === 'connected' ? (
                <CheckCircle size={10} />
              ) : status === 'error' ? (
                <AlertTriangle size={10} />
              ) : status === 'expiring' ? (
                <Clock size={10} />
              ) : (
                <WifiOff size={10} />
              )
            }
          >
            {t(`settings.providers.status.${status}`, status)}
          </Badge>
        </div>

        {/* Plan tier + Cost */}
        <div className="flex items-center gap-2 flex-wrap">
          {p.plan_tier && (
            <span
              className={cn(
                'inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded',
                'bg-[var(--matrix-accent)]/15 text-[var(--matrix-accent)]',
              )}
            >
              {p.plan_tier}
            </span>
          )}
          <span className={cn('text-xs font-mono', theme.textMuted)}>{formatCost(p.monthly_cost_cents)}</span>
          <span className={cn('text-[10px] font-mono ml-auto', theme.textMuted)}>{p.auth_type}</span>
        </div>

        {/* Last verified */}
        <div className="flex items-center gap-1.5">
          <Clock size={10} className={theme.textMuted} />
          <span className={cn('text-[10px] font-mono', theme.textMuted)}>
            {t('settings.providers.lastVerified', 'Verified')}: {formatVerified(p.last_verified)}
          </span>
        </div>

        {/* Error message */}
        {p.last_error && (
          <div className="flex items-start gap-1.5 text-red-400">
            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
            <span className="text-[10px] font-mono leading-tight line-clamp-2">{p.last_error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          {p.is_connected ? (
            <>
              <Button
                variant={confirmDisconnect ? 'danger' : 'ghost'}
                size="sm"
                leftIcon={<LogOut size={12} />}
                onClick={handleDisconnect}
                isLoading={isDisconnecting}
                disabled={isDisconnecting}
                className="flex-1 text-xs"
              >
                {confirmDisconnect
                  ? t('settings.providers.confirmDisconnect', 'Confirm?')
                  : t('settings.providers.disconnect', 'Disconnect')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={isTesting ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
                onClick={() => onTest(p.provider)}
                isLoading={isTesting}
                disabled={isTesting}
                className="text-xs"
              >
                {t('settings.providers.test', 'Test')}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<LogIn size={12} />}
              onClick={() => onConnect(p.provider)}
              isLoading={isConnecting}
              disabled={isConnecting}
              className="flex-1 text-xs"
            >
              {t('settings.providers.connect', 'Connect')}
            </Button>
          )}
        </div>
      </motion.div>
    );
  },
);

ProviderCard.displayName = 'ProviderCard';

// ── SummaryFooter ──────────────────────────────────────────────────────────────

const SummaryFooter = memo<{ providers: ProviderInfo[] }>(({ providers }) => {
  const { t } = useTranslation();
  const theme = useViewTheme();

  const connected = providers.filter((p) => p.is_connected);
  const totalCostCents = connected.reduce((sum, p) => sum + p.monthly_cost_cents, 0);
  const hasErrors = providers.some((p) => p.last_error);

  return (
    <div className={cn('flex items-center justify-between flex-wrap gap-3 pt-4 mt-2', 'border-t border-white/10')}>
      {/* Connected count */}
      <div className="flex items-center gap-2">
        <Zap size={14} className="text-[var(--matrix-accent)]" />
        <span className={cn('text-xs font-mono', theme.text)}>
          {t('settings.providers.connectedCount', '{{count}}/{{total}} connected', {
            count: connected.length,
            total: providers.length,
          })}
        </span>
      </div>

      {/* Total cost */}
      <div className="flex items-center gap-2">
        <span className={cn('text-xs font-mono font-semibold', theme.text)}>
          {t('settings.providers.totalCost', 'Total')}: ${(totalCostCents / 100).toFixed(0)}/mo
        </span>
      </div>

      {/* Vault health */}
      <div className="flex items-center gap-1.5">
        <div className={cn('w-2 h-2 rounded-full', hasErrors ? 'bg-red-500 animate-pulse' : 'bg-emerald-500')} />
        <span className={cn('text-[10px] font-mono', theme.textMuted)}>{t('settings.providers.vault', 'Vault')}</span>
      </div>
    </div>
  );
});

SummaryFooter.displayName = 'SummaryFooter';

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AiProvidersSection() {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const queryClient = useQueryClient();

  // ── Data Fetching ──

  const {
    data: providers,
    isLoading,
    isError,
    refetch,
  } = useQuery<ProviderInfo[]>({
    queryKey: ['ai-providers'],
    queryFn: () => apiGet<ProviderInfo[]>('/api/ai/providers'),
    refetchInterval: 30000,
  });

  // ── Mutations ──

  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'connect' | 'disconnect' | 'test' | null>(null);

  const connectMutation = useMutation({
    mutationFn: async (provider: string) => {
      setActionTarget(provider);
      setActionType('connect');
      const res = await apiPost<{ authorize_url?: string }>(`/api/ai/providers/${provider}/connect`, {});
      return { provider, ...res };
    },
    onSuccess: (data) => {
      if (data.authorize_url) {
        window.open(data.authorize_url, '_blank', 'noopener,noreferrer');
        toast.info(t('settings.providers.oauthRedirect', 'Opening authorization page...'));
      } else {
        toast.success(t('settings.providers.connectSuccess', '{{provider}} connected', { provider: data.provider }));
      }
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || t('settings.providers.connectError', 'Connection failed'));
    },
    onSettled: () => {
      setActionTarget(null);
      setActionType(null);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      setActionTarget(provider);
      setActionType('disconnect');
      await apiPost(`/api/ai/providers/${provider}/disconnect`, {});
      return provider;
    },
    onSuccess: (provider) => {
      toast.success(t('settings.providers.disconnectSuccess', '{{provider}} disconnected', { provider }));
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || t('settings.providers.disconnectError', 'Disconnect failed'));
    },
    onSettled: () => {
      setActionTarget(null);
      setActionType(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: async (provider: string) => {
      setActionTarget(provider);
      setActionType('test');
      const res = await apiPost<{ ok: boolean; latency_ms?: number }>(`/api/ai/providers/${provider}/test`, {});
      return { provider, ...res };
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast.success(
          t('settings.providers.testSuccess', '{{provider}} OK ({{ms}}ms)', {
            provider: data.provider,
            ms: data.latency_ms ?? '?',
          }),
        );
      } else {
        toast.error(t('settings.providers.testFailed', '{{provider}} test failed', { provider: data.provider }));
      }
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || t('settings.providers.testError', 'Test failed'));
    },
    onSettled: () => {
      setActionTarget(null);
      setActionType(null);
    },
  });

  // ── Handlers ──

  const handleConnect = useCallback((provider: string) => connectMutation.mutate(provider), [connectMutation]);

  const handleDisconnect = useCallback((provider: string) => disconnectMutation.mutate(provider), [disconnectMutation]);

  const handleTest = useCallback((provider: string) => testMutation.mutate(provider), [testMutation]);

  // ── Render ──

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-[var(--matrix-accent)]" />
          <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
            {t('settings.providers.title', 'AI Providers')}
          </h3>
        </div>

        <Button
          variant="ghost"
          size="sm"
          leftIcon={<RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />}
          onClick={() => refetch()}
          disabled={isLoading}
          className="text-xs"
        >
          {t('settings.providers.refresh', 'Refresh')}
        </Button>
      </div>

      <p className={cn('text-xs', theme.textMuted)}>
        {t(
          'settings.providers.description',
          'Manage connections to AI providers. Credentials are stored securely in the Jaskier Vault.',
        )}
      </p>

      {/* Loading state */}
      {isLoading && !providers && (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 size={20} className="text-[var(--matrix-accent)] animate-spin" />
          <span className={cn('text-sm font-mono', theme.textMuted)}>
            {t('settings.providers.loading', 'Loading providers...')}
          </span>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-2 py-4 text-red-400">
          <AlertTriangle size={16} />
          <span className="text-xs font-mono">
            {t('settings.providers.fetchError', 'Failed to load providers. Check backend connection.')}
          </span>
        </div>
      )}

      {/* Provider Grid */}
      {providers && providers.length > 0 && (
        <AnimatePresence mode="popLayout">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {providers.map((p) => (
              <ProviderCard
                key={p.provider}
                provider={p}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onTest={handleTest}
                isConnecting={actionTarget === p.provider && actionType === 'connect'}
                isDisconnecting={actionTarget === p.provider && actionType === 'disconnect'}
                isTesting={actionTarget === p.provider && actionType === 'test'}
              />
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Empty state */}
      {providers && providers.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8">
          <WifiOff size={24} className={theme.textMuted} />
          <span className={cn('text-sm font-mono', theme.textMuted)}>
            {t('settings.providers.empty', 'No providers configured')}
          </span>
        </div>
      )}

      {/* Summary Footer */}
      {providers && providers.length > 0 && <SummaryFooter providers={providers} />}
    </div>
  );
}
