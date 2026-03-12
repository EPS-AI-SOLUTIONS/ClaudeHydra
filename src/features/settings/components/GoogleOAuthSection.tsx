/** Jaskier Shared Pattern — Google OAuth + API Key Section for Settings */

import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { AlertTriangle, CheckCircle, Chrome, ExternalLink, Eye, EyeOff, Key, Loader2, LogOut } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Input } from '@/components/atoms';
import { useGoogleAuthStatus } from '@/shared/hooks/useGoogleAuthStatus';

const phaseVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

export const GoogleOAuthSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { status, phase, authMethod, login, saveApiKey, logout, cancel, authUrl, errorMessage, isMutating } =
    useGoogleAuthStatus();

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
      saveApiKey(apiKey.trim());
      setApiKey('');
    }
  };

  const expiresFormatted = status?.expires_at ? new Date(status.expires_at * 1000).toLocaleString() : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Chrome size={18} className="text-[var(--matrix-accent)]" />
        <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
          {t('googleAuth.title')}
        </h3>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Authenticated ── */}
        {phase === 'authenticated' && (
          <motion.div key="auth" {...phaseVariants} className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="accent" size="sm" icon={<CheckCircle size={12} />}>
                {t('googleAuth.connected')}
              </Badge>
              {authMethod && (
                <span className={cn('text-xs font-mono', theme.textMuted)}>
                  {t('googleAuth.method', {
                    method: authMethod === 'oauth' ? 'Google OAuth' : authMethod === 'api_key' ? 'API Key' : 'Env',
                  })}
                </span>
              )}
            </div>

            {status?.user_email && (
              <p className={cn('text-xs font-mono', theme.textMuted)}>
                {t('googleAuth.connectedAs', { email: status.user_email })}
              </p>
            )}

            {expiresFormatted && (
              <p className={cn('text-xs font-mono', theme.textMuted)}>
                {t('googleAuth.expiresAt', { date: expiresFormatted })}
              </p>
            )}

            {authMethod !== 'env' && (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<LogOut size={14} />}
                onClick={logout}
                isLoading={isMutating}
              >
                {t('googleAuth.disconnect')}
              </Button>
            )}

            {/* Allow upgrading from env var to OAuth */}
            {authMethod === 'env' && status?.oauth_available && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <p className={cn('text-xs', theme.textMuted)}>{t('googleAuth.upgradeToOAuth')}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Chrome size={14} />}
                  onClick={login}
                  isLoading={isMutating}
                  className="w-full"
                >
                  {t('googleAuth.signInWithGoogle')}
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── OAuth pending (polling) ── */}
        {phase === 'oauth_pending' && (
          <motion.div key="pending" {...phaseVariants} className="space-y-4">
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="text-[var(--matrix-accent)] animate-spin" />
              <span className={cn('text-sm font-medium', theme.text)}>{t('googleAuth.oauthWaiting')}</span>
            </div>
            <p className={cn('text-xs', theme.textMuted)}>{t('googleAuth.oauthWaitingDesc')}</p>
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
                <ExternalLink size={11} />
                accounts.google.com
              </a>
            )}
            <Button variant="ghost" size="sm" onClick={cancel}>
              {t('googleAuth.cancel')}
            </Button>
          </motion.div>
        )}

        {/* ── Idle / Saving / Error — show both API Key form + OAuth button ── */}
        {(phase === 'idle' || phase === 'saving_key' || phase === 'error') && (
          <motion.div key="idle" {...phaseVariants} className="space-y-5">
            {/* API Key Form */}
            <form onSubmit={handleSaveKey} className="space-y-3">
              <div className="flex items-center gap-2">
                <Key size={14} className="text-[var(--matrix-accent)]" />
                <span className={cn('text-xs font-semibold font-mono', theme.text)}>{t('googleAuth.apiKeyTitle')}</span>
              </div>

              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('googleAuth.apiKeyPlaceholder')}
                autoComplete="off"
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className={cn('p-1 rounded hover:bg-white/10 transition-colors', theme.textMuted)}
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                }
              />

              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!apiKey.trim() || phase === 'saving_key'}
                isLoading={phase === 'saving_key'}
                leftIcon={<Key size={14} />}
                className="w-full"
              >
                {t('googleAuth.apiKeyValidate')}
              </Button>

              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-mono',
                  'text-[var(--matrix-accent)] hover:underline',
                )}
              >
                <ExternalLink size={11} />
                {t('googleAuth.apiKeyGetLink')}
              </a>
            </form>

            {/* Divider + OAuth Button */}
            {status?.oauth_available && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className={cn('text-[10px] font-mono uppercase tracking-wider', theme.textMuted)}>
                    {t('googleAuth.or')}
                  </span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Chrome size={14} />}
                  onClick={login}
                  isLoading={isMutating}
                  className="w-full"
                >
                  {t('googleAuth.signInWithGoogle')}
                </Button>
              </>
            )}

            {/* Error message */}
            {phase === 'error' && errorMessage && (
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle size={14} />
                <span className="text-xs font-mono">{errorMessage}</span>
              </div>
            )}

            {/* Expired warning */}
            {status?.authenticated && status.expired && (
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle size={14} />
                <span className="text-xs font-mono">{t('googleAuth.expired')}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

GoogleOAuthSection.displayName = 'GoogleOAuthSection';
