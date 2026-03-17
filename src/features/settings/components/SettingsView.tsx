/** Jaskier Shared Pattern — Settings View */

import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/atoms';
import AiProvidersSection from './AiProvidersSection';
import { AutoUpdaterSection } from './AutoUpdaterSection';
import { BrowserProxySection } from './BrowserProxySection';
import { CompactionSection } from './CompactionSection';
import { CompletionSoundSection } from './CompletionSoundSection';
import { CustomInstructionsSection } from './CustomInstructionsSection';
import { MaxIterationsSection } from './MaxIterationsSection';
import { MaxTokensSection } from './MaxTokensSection';
import { McpServersSection } from './McpServersSection';
import { TelemetrySection } from './TelemetrySection';
import { TemperatureSection } from './TemperatureSection';
import VaultStatusSection from './VaultStatusSection';
import { WasmEdgePanel } from './WasmEdgePanel';
import { WatchdogHistory } from './WatchdogHistory';
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

        {/* AI Providers Section (unified gateway) */}
        <Card>
          <div className="p-6">
            <AiProvidersSection />
          </div>
        </Card>

        {/* Vault Status Section */}
        <Card>
          <div className="p-6">
            <VaultStatusSection />
          </div>
        </Card>

        {/* WASM Edge Computing */}
        <Card>
          <div className="p-6">
            <WasmEdgePanel />
          </div>
        </Card>

        {/* Working Folder Section */}
        <Card>
          <div className="p-6">
            <WorkingFolderSection />
          </div>
        </Card>

        {/* Custom Instructions Section */}
        <Card>
          <div className="p-6">
            <CustomInstructionsSection />
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

        {/* Message Compaction Section */}
        <Card>
          <div className="p-6">
            <CompactionSection />
          </div>
        </Card>

        {/* Completion Sound Section */}
        <Card>
          <div className="p-6">
            <CompletionSoundSection />
          </div>
        </Card>

        {/* Auto Updater Section */}
        <Card>
          <div className="p-6">
            <AutoUpdaterSection />
          </div>
        </Card>

        {/* Telemetry Section */}
        <Card>
          <div className="p-6">
            <TelemetrySection />
          </div>
        </Card>

        {/* Browser Proxy Section */}
        <Card>
          <div className="p-6">
            <BrowserProxySection />
          </div>
        </Card>

        {/* Watchdog History */}
        <Card>
          <div className="p-6">
            <WatchdogHistory />
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
