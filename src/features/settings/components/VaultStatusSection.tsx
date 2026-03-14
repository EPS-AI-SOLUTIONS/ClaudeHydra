/** Jaskier Shared Pattern — Vault Status Dashboard Section */

import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Lock,
  Mountain,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Input } from '@/components/atoms';
import { apiGet, apiPost } from '@/shared/api/client';

// ── Types ──────────────────────────────────────────────────────────────

interface VaultHealth {
  online: boolean;
  credential_count: number;
  namespace_count: number;
  last_audit: string | null;
  encryption: string;
}

interface AuditEntry {
  timestamp: string;
  action: string;
  namespace: string;
  service: string;
  result: 'success' | 'failed';
}

interface NamespaceInfo {
  name: string;
  services: { name: string; connected: boolean }[];
}

type VaultStatus = 'online' | 'offline' | 'degraded';

// ── Helpers ────────────────────────────────────────────────────────────

function resolveVaultStatus(health: VaultHealth | undefined): VaultStatus {
  if (!health) return 'offline';
  if (!health.online) return 'offline';
  if (health.credential_count === 0) return 'degraded';
  return 'online';
}

const STATUS_CONFIG: Record<VaultStatus, { color: string; pulseClass: string; label: string }> = {
  online: { color: 'bg-emerald-500', pulseClass: 'animate-pulse', label: 'Online' },
  offline: { color: 'bg-red-500', pulseClass: '', label: 'Offline' },
  degraded: { color: 'bg-amber-500', pulseClass: 'animate-pulse', label: 'Degraded' },
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

const collapseVariants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1, transition: { duration: 0.2 } },
  exit: { height: 0, opacity: 0, transition: { duration: 0.15 } },
};

// ── Component ──────────────────────────────────────────────────────────

export default function VaultStatusSection() {
  const { t } = useTranslation();
  const theme = useViewTheme();

  const [namespacesOpen, setNamespacesOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [panicInput, setPanicInput] = useState('');
  const [panicLoading, setPanicLoading] = useState(false);
  const [rotateLoading, setRotateLoading] = useState(false);

  // ── Data fetching ──

  const { data: vaultHealth } = useQuery<VaultHealth>({
    queryKey: ['vault-health'],
    queryFn: () => apiGet<VaultHealth>('/api/vault/health'),
    refetchInterval: 60000,
  });

  const { data: auditEntries } = useQuery<AuditEntry[]>({
    queryKey: ['vault-audit'],
    queryFn: () => apiGet<AuditEntry[]>('/api/vault/audit?limit=5'),
    refetchInterval: 60000,
  });

  const { data: namespaces } = useQuery<NamespaceInfo[]>({
    queryKey: ['vault-namespaces'],
    queryFn: () => apiGet<NamespaceInfo[]>('/api/vault/namespaces'),
    refetchInterval: 120000,
    enabled: namespacesOpen,
  });

  // ── Derived state ──

  const status = useMemo(() => resolveVaultStatus(vaultHealth), [vaultHealth]);
  const statusCfg = STATUS_CONFIG[status];

  // ── Handlers ──

  const handlePanic = useCallback(async () => {
    if (panicInput !== 'PANIC') return;
    setPanicLoading(true);
    try {
      await apiPost('/api/vault/panic', {});
      toast.success(t('settings.vault.panicSuccess', 'Vault destroyed'));
      setPanicInput('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Panic failed');
    } finally {
      setPanicLoading(false);
    }
  }, [panicInput, t]);

  const handleRotate = useCallback(async () => {
    setRotateLoading(true);
    try {
      await apiPost('/api/vault/rotate', {});
      toast.success(t('settings.vault.rotateSuccess', 'Credentials rotated'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rotation failed');
    } finally {
      setRotateLoading(false);
    }
  }, [t]);

  // ── Render ──

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mountain size={18} className="text-[var(--matrix-accent)]" />
          <div>
            <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
              {t('settings.vault.title', 'Skarbiec Krasnali')}
            </h3>
            <p className={cn('text-[10px] font-mono', theme.textMuted)}>Jaskier Vault — The Sentinel</p>
          </div>
        </div>

        {/* Status dot */}
        <div className="flex items-center gap-2">
          <span className={cn('w-2.5 h-2.5 rounded-full', statusCfg.color, statusCfg.pulseClass)} />
          <span className={cn('text-xs font-mono font-semibold', theme.text)}>{statusCfg.label}</span>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          theme={theme}
          label={t('settings.vault.credentialCount', 'Credentials')}
          value={vaultHealth?.credential_count ?? '—'}
          icon={<KeyRound size={14} />}
        />
        <StatCard
          theme={theme}
          label={t('settings.vault.namespaceCount', 'Namespaces')}
          value={vaultHealth?.namespace_count ?? '—'}
          icon={<Server size={14} />}
        />
        <StatCard
          theme={theme}
          label={t('settings.vault.lastAudit', 'Last Audit')}
          value={vaultHealth?.last_audit ? formatTimestamp(vaultHealth.last_audit) : '—'}
          icon={<Shield size={14} />}
          small
        />
        <StatCard
          theme={theme}
          label={t('settings.vault.encryption', 'Encryption')}
          value={vaultHealth?.encryption ?? 'AES-256-GCM'}
          icon={<Lock size={14} />}
          badge
        />
      </div>

      {/* ── Namespace browser (collapsible) ── */}
      <div>
        <button
          type="button"
          onClick={() => setNamespacesOpen((p) => !p)}
          className={cn(
            'flex items-center gap-2 w-full text-left py-1.5',
            'text-xs font-mono font-semibold uppercase tracking-wider',
            theme.text,
            'hover:text-[var(--matrix-accent)] transition-colors',
          )}
        >
          {namespacesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {t('settings.vault.namespaces', 'Namespace Browser')}
        </button>

        <AnimatePresence>
          {namespacesOpen && (
            <motion.div key="ns-list" {...collapseVariants} className="overflow-hidden">
              <div className="space-y-3 pt-2">
                {namespaces && namespaces.length > 0 ? (
                  namespaces.map((ns) => <NamespaceRow key={ns.name} ns={ns} theme={theme} />)
                ) : (
                  <p className={cn('text-xs font-mono', theme.textMuted)}>
                    {t('settings.vault.noNamespaces', 'No namespaces available')}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Recent audit log ── */}
      <div className="space-y-2">
        <h4 className={cn('text-xs font-mono font-semibold uppercase tracking-wider', theme.text)}>
          {t('settings.vault.recentAudit', 'Recent Audit Log')}
        </h4>

        {auditEntries && auditEntries.length > 0 ? (
          <div className="space-y-1">
            {auditEntries.map((entry) => (
              <AuditRow key={`${entry.timestamp}-${entry.action}-${entry.service}`} entry={entry} theme={theme} />
            ))}
          </div>
        ) : (
          <p className={cn('text-xs font-mono', theme.textMuted)}>
            {t('settings.vault.noAudit', 'No recent audit entries')}
          </p>
        )}
      </div>

      {/* ── Emergency controls (collapsed by default) ── */}
      <div className={cn('border rounded-lg', emergencyOpen ? 'border-red-500/50' : 'border-red-500/20')}>
        <button
          type="button"
          onClick={() => setEmergencyOpen((p) => !p)}
          className={cn(
            'flex items-center gap-2 w-full text-left px-3 py-2',
            'text-xs font-mono font-semibold uppercase tracking-wider',
            'text-red-400 hover:text-red-300 transition-colors',
          )}
        >
          <ShieldAlert size={14} />
          {emergencyOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {t('settings.vault.emergency', 'Emergency Controls')}
        </button>

        <AnimatePresence>
          {emergencyOpen && (
            <motion.div key="emergency" {...collapseVariants} className="overflow-hidden">
              <div className="px-3 pb-3 space-y-4">
                <p className="text-xs text-red-400/80 font-mono">
                  {t(
                    'settings.vault.emergencyWarning',
                    'Te akcje sa nieodwracalne. Uzyj tylko w sytuacji naruszenia bezpieczenstwa.',
                  )}
                </p>

                {/* Vault Panic */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Trash2 size={14} className="text-red-400" />
                    <span className={cn('text-xs font-mono font-semibold', theme.text)}>Vault Panic</span>
                  </div>
                  <p className={cn('text-[10px] font-mono', theme.textMuted)}>
                    {t('settings.vault.panicDesc', 'Destroys all credentials. Type PANIC to confirm.')}
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={panicInput}
                      onChange={(e) => setPanicInput(e.target.value)}
                      placeholder="PANIC"
                      className="max-w-[120px] text-xs font-mono"
                    />
                    <Button
                      variant="danger"
                      size="sm"
                      leftIcon={<Trash2 size={12} />}
                      onClick={handlePanic}
                      disabled={panicInput !== 'PANIC' || panicLoading}
                      isLoading={panicLoading}
                    >
                      {t('settings.vault.panicButton', 'Destroy Vault')}
                    </Button>
                  </div>
                </div>

                {/* Rotate All */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={14} className="text-amber-400" />
                    <span className={cn('text-xs font-mono font-semibold', theme.text)}>
                      {t('settings.vault.rotateTitle', 'Rotate All Credentials')}
                    </span>
                  </div>
                  <p className={cn('text-[10px] font-mono', theme.textMuted)}>
                    {t('settings.vault.rotateDesc', 'Triggers credential rotation for all providers.')}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<RefreshCw size={12} />}
                    onClick={handleRotate}
                    isLoading={rotateLoading}
                  >
                    {t('settings.vault.rotateButton', 'Rotate All')}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer link ── */}
      <a
        href="http://localhost:5190"
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-mono',
          'text-[var(--matrix-accent)] hover:underline',
        )}
      >
        <ExternalLink size={12} />
        {t('settings.vault.openDashboard', 'Otworz pelny dashboard Vault')} &rarr;
      </a>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

interface StatCardProps {
  theme: ReturnType<typeof useViewTheme>;
  label: string;
  value: string | number;
  icon: React.ReactNode;
  small?: boolean;
  badge?: boolean;
}

const StatCard = memo(({ theme, label, value, icon, small, badge }: StatCardProps) => (
  <div className={cn('rounded-lg p-2.5 bg-[var(--matrix-glass)] border border-white/5')}>
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-[var(--matrix-accent)]">{icon}</span>
      <span className={cn('text-[10px] font-mono uppercase tracking-wider', theme.textMuted)}>{label}</span>
    </div>
    {badge ? (
      <Badge variant="accent" size="sm">
        {value}
      </Badge>
    ) : (
      <span className={cn('font-mono font-bold', small ? 'text-xs' : 'text-lg', theme.text)}>{value}</span>
    )}
  </div>
));

StatCard.displayName = 'StatCard';

const NamespaceRow = memo(({ ns, theme }: { ns: NamespaceInfo; theme: ReturnType<typeof useViewTheme> }) => (
  <div className="space-y-1">
    <span className={cn('text-xs font-mono font-semibold', theme.text)}>{ns.name}</span>
    <div className="flex flex-wrap gap-2 pl-2">
      {ns.services.map((svc) => (
        <div key={svc.name} className="flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full', svc.connected ? 'bg-emerald-500' : 'bg-red-500/60')} />
          <span className={cn('text-[10px] font-mono', theme.textMuted)}>{svc.name}</span>
        </div>
      ))}
    </div>
  </div>
));

NamespaceRow.displayName = 'NamespaceRow';

const AuditRow = memo(({ entry, theme }: { entry: AuditEntry; theme: ReturnType<typeof useViewTheme> }) => (
  <div
    className={cn(
      'flex items-center gap-3 px-2 py-1 rounded text-[10px] font-mono',
      'bg-[var(--matrix-glass)] border border-white/5',
    )}
  >
    <span className={cn('min-w-[100px]', theme.textMuted)}>{formatTimestamp(entry.timestamp)}</span>
    <Badge variant={entry.action === 'DELEGATE' ? 'accent' : 'default'} size="sm">
      {entry.action}
    </Badge>
    <span className={cn('flex-1 truncate', theme.text)}>
      {entry.namespace}/{entry.service}
    </span>
    <span
      className={cn(
        'text-[9px] font-semibold uppercase',
        entry.result === 'success' ? 'text-emerald-400' : 'text-red-400',
      )}
    >
      {entry.result}
    </span>
  </div>
));

AuditRow.displayName = 'AuditRow';
