// src/features/chat/components/ChatInput.tsx

import { BaseChatInput, type BaseChatInputHandle } from '@jaskier/ui';
import { AlertCircle, ChevronDown, FolderOpen, Network, Send, StopCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/atoms';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';
import { ImagePreview } from './ImagePreview';
import { useChatFileHandler } from './useChatFileHandler';
import { WorkingFolderPicker } from './WorkingFolderPicker';

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'file';
  content: string;
}

export interface ChatInputHandle {
  focus: () => void;
  setValue: (value: string) => void;
}

type OrchestrationMode = 'direct' | 'orchestrate';
type OrchestrationPattern = 'auto' | 'sequential' | 'parallel' | 'loop' | 'hierarchical' | 'review' | 'security';

interface ChatInputProps {
  isStreaming: boolean;
  onSubmit: (prompt: string, image: string | null) => void;
  onOrchestrate?: (prompt: string, pattern: string) => void;
  onStop?: () => void;
  pendingImage: string | null;
  onClearImage: () => void;
  onPasteImage?: (base64: string) => void;
  onPasteFile?: (content: string, filename: string) => void;
  onAttachPath?: (path: string) => void;
  promptHistory?: string[];
  sessionId?: string;
  workingDirectory?: string;
  onWorkingDirectoryChange?: (wd: string) => void;
  initialValue?: string;
  initialValueKey?: number;
}

const PATTERN_OPTIONS: Array<{ value: OrchestrationPattern; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'hierarchical', label: 'Hierarchical' },
  { value: 'sequential', label: 'Sequential' },
  { value: 'parallel', label: 'Parallel' },
  { value: 'loop', label: 'Loop' },
  { value: 'review', label: 'Code Review' },
  { value: 'security', label: 'Security Review' },
];

export const ChatInput = memo<ChatInputProps>(
  ({
    isStreaming,
    onSubmit,
    onOrchestrate,
    onStop,
    pendingImage,
    onClearImage,
    onPasteImage,
    onPasteFile,
    promptHistory = [],
    sessionId,
    workingDirectory,
    onWorkingDirectoryChange,
    initialValue,
    initialValueKey,
  }) => {
    const { t } = useTranslation();
    const theme = useViewTheme();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const baseInputRef = useRef<BaseChatInputHandle>(null);
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);

    const [orchMode, setOrchMode] = useState<OrchestrationMode>('direct');
    const [orchPattern, setOrchPattern] = useState<OrchestrationPattern>('auto');
    const [showPatternPicker, setShowPatternPicker] = useState(false);

    const prevKeyRef = useRef(0);
    useEffect(() => {
      if (initialValueKey !== undefined && initialValueKey !== prevKeyRef.current && initialValue) {
        prevKeyRef.current = initialValueKey;
        setValue(initialValue);
        baseInputRef.current?.setValue(initialValue);
      }
    }, [initialValue, initialValueKey]);

    const canSubmit = !isStreaming && (value.trim().length > 0 || !!pendingImage);

    const handleSubmit = useCallback(
      (val: string) => {
        if (!canSubmit) return;
        const trimmed = val.trim();
        if (orchMode === 'orchestrate' && onOrchestrate) {
          const pattern = orchPattern === 'auto' ? 'hierarchical' : orchPattern;
          onOrchestrate(trimmed, pattern);
        } else {
          onSubmit(trimmed, pendingImage);
        }
        setValue('');
        setError(null);
        setShowPatternPicker(false);
        baseInputRef.current?.clear();
      },
      [canSubmit, onSubmit, onOrchestrate, pendingImage, orchMode, orchPattern],
    );

    const { handlePaste, handleDrop, handleFileSelect } = useChatFileHandler({
      onPasteImage,
      onPasteFile,
    });

    return (
      <section className="p-4 flex flex-col relative transition-all duration-300 z-10 w-full" onDrop={handleDrop}>
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className={cn(
                'absolute bottom-full left-4 mb-2',
                'flex items-center gap-2 text-sm',
                'text-red-400 bg-red-950/90 border border-red-500/30',
                'px-3 py-2 rounded-lg shadow-lg backdrop-blur-sm',
              )}
            >
              <AlertCircle size={14} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <BaseChatInput
          ref={baseInputRef}
          value={value}
          onChange={setValue}
          onSend={handleSubmit}
          disabled={isStreaming}
          placeholder={pendingImage ? t('chat.describeVisualContext') : t('chat.typeMessage')}
          promptHistory={promptHistory}
          onPaste={handlePaste as any}
          topActions={
            <>
              {pendingImage && (
                <div className="flex w-full mb-2">
                  <ImagePreview src={pendingImage} onRemove={onClearImage} />
                </div>
              )}
              {sessionId && onWorkingDirectoryChange && (
                <WorkingFolderPicker
                  sessionId={sessionId}
                  workingDirectory={workingDirectory ?? ''}
                  onDirectoryChange={onWorkingDirectoryChange}
                />
              )}
            </>
          }
          leftActions={
            <>
              {onOrchestrate && (
                <div className="relative">
                  <Button
                    type="button"
                    variant={orchMode === 'orchestrate' ? 'primary' : 'ghost'}
                    size="md"
                    aria-label="Toggle orchestration mode"
                    aria-expanded={showPatternPicker}
                    onClick={() => {
                      if (orchMode === 'direct') {
                        setOrchMode('orchestrate');
                        setShowPatternPicker(true);
                      } else {
                        setOrchMode('direct');
                        setShowPatternPicker(false);
                      }
                    }}
                    title={
                      orchMode === 'orchestrate'
                        ? t('chat.switchToDirect', 'Switch to direct mode')
                        : t('chat.switchToOrchestrate', 'Switch to orchestrate mode')
                    }
                  >
                    <Network size={18} />
                    <ChevronDown size={12} className="ml-0.5" />
                  </Button>
                  <AnimatePresence>
                    {showPatternPicker && orchMode === 'orchestrate' && (
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.95 }}
                        className={cn(
                          'absolute bottom-full left-0 mb-2 z-50',
                          'min-w-[160px] py-1 rounded-lg shadow-lg',
                          'border border-white/10',
                          theme.dropdown,
                        )}
                      >
                        {PATTERN_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setOrchPattern(opt.value);
                              setShowPatternPicker(false);
                            }}
                            className={cn(
                              'w-full text-left px-3 py-1.5 text-sm font-mono transition-colors',
                              theme.dropdownItem,
                              orchPattern === opt.value && 'font-bold',
                            )}
                          >
                            {orchPattern === opt.value && '> '}
                            {opt.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {(onPasteImage || onPasteFile) && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    aria-hidden="true"
                    className="hidden"
                    onChange={handleFileSelect}
                    accept="image/*,.txt,.md,.ts,.tsx,.js,.jsx,.json,.css,.html,.py,.rs,.toml,.yaml,.yml,.xml,.csv,.log,.sh,.bat,.sql,.env"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    aria-label="Attach local file"
                    aria-keyshortcuts="Ctrl+O"
                    onClick={() => fileInputRef.current?.click()}
                    title={t('chat.attachLocalFile', 'Attach local file')}
                  >
                    <FolderOpen size={20} />
                  </Button>
                </>
              )}
            </>
          }
          rightActions={
            <>
              {isStreaming ? (
                <Button
                  type="button"
                  variant="danger"
                  size="md"
                  aria-label="Stop generation"
                  onClick={onStop}
                  title={t('chat.stopGeneration', 'Stop generation')}
                >
                  <StopCircle size={20} className="animate-pulse" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={!canSubmit}
                  aria-label="Send message"
                  aria-disabled={!canSubmit}
                  onClick={() => handleSubmit(value)}
                  title={t('chat.send', 'Send')}
                >
                  <Send size={20} strokeWidth={2.5} className="ml-0.5" aria-hidden="true" />
                </Button>
              )}
            </>
          }
        />
      </section>
    );
  },
);

ChatInput.displayName = 'ChatInput';
export default ChatInput;
