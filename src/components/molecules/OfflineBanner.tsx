/**
 * OfflineBanner — Shows a fixed banner when the browser is offline.
 * Slides down from the top with animation.
 *
 * #25 Offline detection
 */

import { useOnlineStatus } from '@jaskier/core';
import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

export function OfflineBanner() {
  const { t } = useTranslation();
  const isOnline = useOnlineStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          role="alert"
          aria-live="assertive"
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600/95 text-white text-sm font-mono backdrop-blur-sm"
        >
          <WifiOff size={16} />
          <span>{t('common.offlineMessage')}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
