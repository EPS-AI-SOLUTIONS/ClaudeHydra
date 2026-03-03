/** Jaskier Shared Pattern — Settings View */

import { Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/atoms';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';
import { CompletionSoundSection } from './CompletionSoundSection';
import { GoogleOAuthSection } from './GoogleOAuthSection';
import { MaxIterationsSection } from './MaxIterationsSection';
import { MaxTokensSection } from './MaxTokensSection';
import { McpServersSection } from './McpServersSection';
import { OAuthSection } from './OAuthSection';
import { TemperatureSection } from './TemperatureSection';
import { WorkingFolderSection } from './WorkingFolderSection';

export const SettingsView = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();

  return (
    <div data-testid="settings-view" className="h-full flex flex-col items-center p-8 overflow-y-auto">
      <motion.div
        className="w-full max-w-2xl space-y-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <Settings size={22} className="text-[var(--matrix-accent)]" />
          <h1 className={cn('text-2xl font-bold font-mono tracking-tight', theme.title)}>
            {t('settings.title', 'Settings')}
          </h1>
        </div>

        {/* Anthropic OAuth Section */}
        <Card>
          <div className="p-6">
            <OAuthSection />
          </div>
        </Card>

        {/* Google OAuth Section */}
        <Card>
          <div className="p-6">
            <GoogleOAuthSection />
          </div>
        </Card>

        {/* Working Folder Section */}
        <Card>
          <div className="p-6">
            <WorkingFolderSection />
          </div>
        </Card>

        {/* Temperature Section */}
        <Card>
          <div className="p-6">
            <TemperatureSection />
          </div>
        </Card>

        {/* Max Tokens Section */}
        <Card>
          <div className="p-6">
            <MaxTokensSection />
          </div>
        </Card>

        {/* Agent Iterations Section */}
        <Card>
          <div className="p-6">
            <MaxIterationsSection />
          </div>
        </Card>

        {/* Completion Sound Section */}
        <Card>
          <div className="p-6">
            <CompletionSoundSection />
          </div>
        </Card>

        {/* MCP Servers Section */}
        <Card>
          <div className="p-6">
            <McpServersSection />
          </div>
        </Card>
      </motion.div>
    </div>
  );
});

SettingsView.displayName = 'SettingsView';

export default SettingsView;
