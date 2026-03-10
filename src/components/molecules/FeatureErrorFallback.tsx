/** Jaskier Design System */

import { Button } from '@jaskier/ui';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  feature: string;
  onRetry?: () => void;
}

export function FeatureErrorFallback({ feature, onRetry }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-red-400" />
      <h3 className="text-lg font-medium text-[var(--matrix-text-primary)]">{t('common.featureError', { feature })}</h3>
      <p className="text-sm text-[var(--matrix-text-secondary)] max-w-md">{t('common.sectionLoadError')}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" /> {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
