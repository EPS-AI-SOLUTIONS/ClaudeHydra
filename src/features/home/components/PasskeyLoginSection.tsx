/**
 * PasskeyLoginSection — WebAuthn/Passkey login button for the ClaudeHydra home page.
 *
 * Integrates with @jaskier/auth's PasskeyLoginButton and AuthContext.
 * Shows a "Sign in with Passkey" button when the user is not authenticated,
 * and hides itself once authenticated.
 *
 * Uses the browser WebAuthn API (navigator.credentials.get) under the hood
 * via @jaskier/auth's loginWithPasskey flow:
 *   1. POST /api/auth/webauthn/login/start -> challenge
 *   2. navigator.credentials.get({ publicKey }) -> assertion
 *   3. POST /api/auth/webauthn/login/finish -> session cookie
 */

// WebAuthn passkey utilities from @jaskier/auth
import { credentialToJSON, parseRequestOptionsFromJSON } from '@jaskier/auth';
import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

/**
 * Performs the full WebAuthn authentication ceremony:
 * 1. Fetches challenge from backend
 * 2. Calls navigator.credentials.get
 * 3. Sends assertion back to backend
 */
async function authenticateWithPasskey(email?: string): Promise<void> {
  // Step 1: Get challenge from backend
  const startRes = await fetch(`${API_BASE}/api/auth/webauthn/login/start`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!startRes.ok) {
    const body = await startRes.json().catch(() => ({ error: startRes.statusText }));
    throw new Error((body as { error?: string }).error ?? 'Failed to start passkey login');
  }

  const startData = await startRes.json();

  // Step 2: Call navigator.credentials.get (WebAuthn browser API)
  const requestOptions = parseRequestOptionsFromJSON(startData.challenge.publicKey);
  const credential = await navigator.credentials.get({ publicKey: requestOptions });

  // Step 3: Send assertion to backend
  const finishRes = await fetch(`${API_BASE}/api/auth/webauthn/login/finish`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_state: startData.auth_state,
      credential: credentialToJSON(credential),
    }),
  });

  if (!finishRes.ok) {
    const body = await finishRes.json().catch(() => ({ error: finishRes.statusText }));
    throw new Error((body as { error?: string }).error ?? 'Passkey verification failed');
  }
}

/**
 * Checks whether the browser supports WebAuthn/passkeys.
 */
function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.get === 'function'
  );
}

export const PasskeyLoginSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const isLight = theme.isLight;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const supported = isWebAuthnSupported();

  const handlePasskeyLogin = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      await authenticateWithPasskey();
      setIsSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Passkey login failed';
      // Don't show error if user cancelled the WebAuthn dialog
      if (message.includes('AbortError') || message.includes('NotAllowedError')) {
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Don't render if WebAuthn is not supported
  if (!supported) return null;

  return (
    <AnimatePresence>
      {!isSuccess && (
        <motion.div
          className="w-full max-w-lg mt-4"
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <div
            className={cn(
              'relative rounded-2xl p-4',
              'border',
              isLight ? 'bg-white/60 border-gray-200/50 shadow-sm' : 'bg-white/[0.03] border-white/10',
            )}
          >
            <div className="flex items-center gap-4">
              {/* Icon */}
              <div className={cn('flex-shrink-0 p-2.5 rounded-xl', isLight ? 'bg-indigo-50' : 'bg-indigo-500/10')}>
                <Fingerprint size={20} className={cn(isLight ? 'text-indigo-600' : 'text-indigo-400')} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className={cn('text-sm font-semibold font-mono', theme.text)}>
                  {t('passkey.title', 'Sign in with Passkey')}
                </h3>
                <p className={cn('text-xs mt-0.5', theme.textMuted)}>
                  {t('passkey.description', 'Use your fingerprint, face, or security key for passwordless login')}
                </p>
              </div>

              {/* Button */}
              <button
                type="button"
                onClick={() => void handlePasskeyLogin()}
                disabled={isLoading}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium',
                  'transition-all duration-200 flex-shrink-0',
                  isLoading && 'cursor-not-allowed opacity-60',
                  isLight
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm'
                    : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 active:bg-indigo-500/40 border border-indigo-500/30',
                )}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    {t('passkey.authenticating', 'Authenticating...')}
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    {t('passkey.signIn', 'Passkey')}
                  </>
                )}
              </button>
            </div>

            {/* Error message */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cn('text-xs mt-2 px-2', isLight ? 'text-red-600' : 'text-red-400')}
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* Success state */}
      {isSuccess && (
        <motion.div
          className="w-full max-w-lg mt-4"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div
            className={cn(
              'flex items-center gap-3 p-4 rounded-2xl border',
              isLight
                ? 'bg-emerald-50 border-emerald-200/50 text-emerald-700'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
            )}
          >
            <ShieldCheck size={18} />
            <span className="text-sm font-medium">
              {t('passkey.success', 'Successfully authenticated with passkey')}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

PasskeyLoginSection.displayName = 'PasskeyLoginSection';
