/** Jaskier Shared Pattern — OAuth PKCE UI Section */

import { cn } from '@jaskier/ui';
import { AlertTriangle, CheckCircle, Crown, ExternalLink, Key, LogIn, LogOut, Shield } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Input } from '@/components/atoms';
import { useOAuthStatus } from '@/shared/hooks/useOAuthStatus';
import { useViewTheme } from '@/shared/hooks/useViewTheme';

const BENEFITS = [
  { key: 'oauth.benefits.flatRate', icon: Crown },
  { key: 'oauth.benefits.maxPlan', icon: Shield },
  { key: 'oauth.benefits.autoRefresh', icon: CheckCircle },
  { key: 'oauth.benefits.securePkce', icon: Key },
] as const;

const phaseVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

export const OAuthSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { status, phase, login, submitCode, logout, cancel, authUrl, errorMessage, isMutating } = useOAuthStatus();

  const [callbackInput, setCallbackInput] = useState('');

  const handleVerify = () => {
    if (callbackInput.trim()) {
      submitCode(callbackInput.trim());
      setCallbackInput('');
    }
  };

  const expiresFormatted = status?.expires_at ? new Date(status.expires_at * 1000).toLocaleString() : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield size={18} className="text-[var(--matrix-accent)]" />
        <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
          {t('oauth.title')}
        </h3>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Phase: Authenticated ── */}
        {phase === 'authenticated' && (
          <motion.div key="auth" {...phaseVariants} className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="accent" size="sm" icon={<CheckCircle size={12} />}>
                {t('oauth.connected')}
              </Badge>
              {expiresFormatted && (
                <span className={cn('text-xs font-mono', theme.textMuted)}>
                  {t('oauth.expiresAt', { date: expiresFormatted })}
                </span>
              )}
            </div>

            {status?.scope && (
              <p className={cn('text-xs font-mono', theme.textMuted)}>{t('oauth.scope', { scope: status.scope })}</p>
            )}

            <Button variant="danger" size="sm" leftIcon={<LogOut size={14} />} onClick={logout} isLoading={isMutating}>
              {t('oauth.disconnect')}
            </Button>
          </motion.div>
        )}

        {/* ── Phase: Waiting for callback URL ── */}
        {(phase === 'waiting_code' || phase === 'exchanging') && (
          <motion.div key="waiting" {...phaseVariants} className="space-y-4">
            <div>
              <p className={cn('text-sm font-medium', theme.text)}>{t('oauth.waitingTitle')}</p>
              <p className={cn('text-xs mt-1', theme.textMuted)}>{t('oauth.waitingDesc')}</p>
            </div>

            {authUrl && (
              <a
                href={authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-mono',
                  'text-[var(--matrix-accent)] hover:underline',
                )}
              >
                <ExternalLink size={12} />
                claude.ai/oauth
              </a>
            )}

            <Input
              value={callbackInput}
              onChange={(e) => setCallbackInput(e.target.value)}
              placeholder={t('oauth.callbackPlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            />

            {phase === 'exchanging' && (
              <p className={cn('text-xs font-mono animate-pulse', theme.textMuted)}>{t('oauth.exchanging')}</p>
            )}

            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleVerify}
                isLoading={phase === 'exchanging'}
                disabled={!callbackInput.trim() || phase === 'exchanging'}
              >
                {t('oauth.verify')}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancel}>
                {t('oauth.cancel')}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Phase: Idle / Error ── */}
        {(phase === 'idle' || phase === 'error') && (
          <motion.div key="idle" {...phaseVariants} className="space-y-4">
            {/* Benefits */}
            <ul className="space-y-2">
              {BENEFITS.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-start gap-2.5">
                  <Icon size={14} className="text-[var(--matrix-accent)] mt-0.5 flex-shrink-0" />
                  <span className={cn('text-xs', theme.textMuted)}>{t(key)}</span>
                </li>
              ))}
            </ul>

            {phase === 'error' && errorMessage && (
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle size={14} />
                <span className="text-xs">{errorMessage}</span>
              </div>
            )}

            {/* CTA */}
            <div className="flex gap-2 flex-wrap">
              <Button variant="primary" size="sm" leftIcon={<LogIn size={14} />} onClick={login} isLoading={isMutating}>
                {t('oauth.connectWithClaude')}
              </Button>
            </div>

            {/* Expired token warning */}
            {status?.authenticated && status.expired && (
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle size={14} />
                <span className="text-xs font-mono">{t('oauth.expired')}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

OAuthSection.displayName = 'OAuthSection';
