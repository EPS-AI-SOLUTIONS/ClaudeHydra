/**
 * ChatHeader — Header bar for the Claude chat view.
 *
 * Displays the title, connection status, model selector, tools toggle,
 * copy session button, and clear chat button.
 *
 * Extracted from ClaudeChatView.tsx to reduce component file size.
 */

import { Bot, Check, ClipboardList, Trash2, Wrench } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button  } from '@jaskier/ui';
import { type ModelOption, ModelSelector } from '@/components/molecules/ModelSelector';
import { copyToClipboard } from '@/shared/utils/clipboard';
import { formatDateTime, formatTime } from '@/shared/utils/locale';
import type { ChatMessage } from './MessageBubble';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatHeaderProps {
  /** Whether the Claude API is connected. */
  claudeConnected: boolean;
  /** Number of available models. */
  modelCount: number;
  /** List of model options for the selector. */
  modelOptions: ModelOption[];
  /** Currently selected model ID. */
  selectedModel: string | null;
  /** Called when the user selects a model. */
  onModelSelect: (model: ModelOption) => void;
  /** Whether file tools are enabled. */
  toolsEnabled: boolean;
  /** Called to toggle file tools. */
  onToolsToggle: () => void;
  /** Current messages (for copy session). */
  messages: ChatMessage[];
  /** Active session title. */
  activeSessionTitle?: string;
  /** Active session creation timestamp (epoch ms). */
  activeSessionCreatedAt?: number;
  /** Called when the user clicks Clear. */
  onClearChat: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatHeader = memo(function ChatHeader({
  claudeConnected,
  modelCount,
  modelOptions,
  selectedModel,
  onModelSelect,
  toolsEnabled,
  onToolsToggle,
  messages,
  activeSessionTitle,
  activeSessionCreatedAt,
  onClearChat,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const [sessionCopied, setSessionCopied] = useState(false);

  const handleCopySession = useCallback(async () => {
    if (messages.length === 0) return;

    const title = activeSessionTitle ?? 'Untitled';
    const date = activeSessionCreatedAt ? formatDateTime(activeSessionCreatedAt) : '';

    const lines = [`=== ${title} ===`, date ? `Date: ${date}` : '', `Messages: ${messages.length}`, ''];
    for (const msg of messages) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const time = msg.timestamp instanceof Date ? formatTime(msg.timestamp) : '';
      const model = msg.model ? ` (${msg.model})` : '';
      lines.push(`[${role}] ${time}${model}:`);
      lines.push(msg.content);
      lines.push('');
    }

    const text = lines.join('\n');
    const ok = await copyToClipboard(text);
    if (ok) {
      toast.success('Session copied to clipboard');
      setSessionCopied(true);
      setTimeout(() => setSessionCopied(false), 2000);
    } else {
      toast.error('Failed to copy session');
    }
  }, [messages, activeSessionTitle, activeSessionCreatedAt]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      data-testid="chat-header"
      className="flex items-center justify-between mb-4"
    >
      <div className="flex items-center gap-3">
        <Bot className="text-[var(--matrix-accent)]" size={24} />
        <div>
          <h2 className="text-lg font-semibold text-[var(--matrix-accent)] font-mono">
            {t('chat.title', 'Claude Chat')}
          </h2>
          <p data-testid="chat-status-text" className="text-xs text-[var(--matrix-text-secondary)]">
            {claudeConnected ? `${modelCount} models available` : 'Offline — configure API key in Settings'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Tools toggle */}
        <Button
          variant={toolsEnabled ? 'primary' : 'ghost'}
          size="sm"
          onClick={onToolsToggle}
          title={toolsEnabled ? 'File tools enabled' : 'File tools disabled'}
          aria-label={t('chat.toggleFileTools', 'Toggle file tools')}
          leftIcon={<Wrench size={14} />}
        >
          Tools
        </Button>

        {/* Model selector */}
        <ModelSelector
          models={modelOptions}
          selectedId={selectedModel}
          onSelect={onModelSelect}
          disabled={!claudeConnected}
          placeholder={t('chat.selectModel', 'Select model')}
          className="w-56"
        />

        {/* Copy session */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopySession}
          disabled={messages.length === 0}
          title={t('chat.copySession', 'Copy entire session')}
          aria-label={t('chat.copySession', 'Copy entire session')}
          leftIcon={sessionCopied ? <Check size={14} className="text-emerald-400" /> : <ClipboardList size={14} />}
        >
          {sessionCopied ? 'Copied' : 'Copy'}
        </Button>

        {/* Clear chat */}
        <Button
          data-testid="chat-clear-btn"
          variant="ghost"
          size="sm"
          onClick={onClearChat}
          title={t('chat.clearChat', 'Clear chat')}
          aria-label={t('chat.clearChat', 'Clear chat')}
          leftIcon={<Trash2 size={14} />}
        >
          Clear
        </Button>
      </div>
    </motion.div>
  );
});

ChatHeader.displayName = 'ChatHeader';
