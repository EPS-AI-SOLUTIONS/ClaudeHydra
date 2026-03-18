/**
 * ChatInput â€” Composable textarea input with send button, file attachment,
 * and keyboard shortcut support.
 *
 * Ported from ClaudeHydra v3 `OllamaChatView.tsx` inline input area.
 * ClaudeHydra: Extracted as a standalone component for reuse and testing.
 * Refactored to use @jaskier/ui BaseChatInput.
 */

import { BaseChatInput, type BaseChatInputHandle, cn } from '@jaskier/ui';
import { Loader2, Paperclip, Send } from 'lucide-react';
import { motion } from 'motion/react';
import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { AttachmentPreview } from './AttachmentPreview';
import { WorkingFolderPicker } from './WorkingFolderPicker';

export interface Attachment {
  id: string;
  name: string;
  type: 'file' | 'image';
  content: string;
  mimeType: string;
}

interface ChatInputProps {
  onSend: (message: string, attachments: Attachment[]) => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  promptHistory?: string[];
  sessionId?: string;
  workingDirectory?: string;
  onWorkingDirectoryChange?: (wd: string) => void;
}

export interface ChatInputHandle {
  focus: () => void;
  clear: () => void;
  setValue: (text: string) => void;
}

const FILE_ACCEPT = 'image/*,.txt,.md,.json,.js,.ts,.py,.rs,.go,.java,.cpp,.c,.h,.css,.html,.xml,.yaml,.yml,.toml,.sh';

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  (
    {
      onSend,
      disabled = false,
      isLoading = false,
      placeholder = 'Type a message... (Shift+Enter = new line)',
      className,
      promptHistory = [],
      sessionId,
      workingDirectory,
      onWorkingDirectoryChange,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const baseInputRef = useRef<BaseChatInputHandle>(null);

    const handleSend = useCallback(
      (val: string) => {
        const text = val.trim();
        if (!text && attachments.length === 0) return;
        onSend(text, attachments);
        setInput('');
        setAttachments([]);
        baseInputRef.current?.clear();
      },
      [onSend, attachments],
    );

    useImperativeHandle(ref, () => ({
      focus: () => baseInputRef.current?.focus(),
      clear: () => {
        setInput('');
        setAttachments([]);
        baseInputRef.current?.clear();
      },
      setValue: (text: string) => {
        setInput(text);
        baseInputRef.current?.setValue(text);
      },
    }));

    const processFiles = useCallback((files: FileList | File[]) => {
      const newAttachments: Promise<void>[] = Array.from(files).map((file) => {
        return new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const content = e.target?.result as string;
            if (!content) {
              resolve();
              return;
            }
            const isImage = file.type.startsWith('image/');
            const attachment: Attachment = {
              id: crypto.randomUUID(),
              name: file.name,
              type: isImage ? 'image' : 'file',
              content,
              mimeType: file.type,
            };
            setAttachments((prev) => [...prev, attachment]);
            resolve();
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      Promise.all(newAttachments).catch((err) => {
        console.error('Failed to read attached files:', err);
      });
    }, []);

    const handleFileInput = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
          processFiles(e.target.files);
        }
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      [processFiles],
    );

    const handlePaste = useCallback(
      (e: ClipboardEvent<HTMLTextAreaElement>) => {
        if (e.clipboardData.files && e.clipboardData.files.length > 0) {
          e.preventDefault();
          processFiles(e.clipboardData.files);
        }
      },
      [processFiles],
    );

    const handleDrop = useCallback(
      (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFiles(e.dataTransfer.files);
        }
      },
      [processFiles],
    );

    const handleDragOver = useCallback((e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    }, []);

    const removeAttachment = useCallback((id: string) => {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    }, []);

    const canSend = (input.trim().length > 0 || attachments.length > 0) && !isLoading && !disabled;

    return (
      <section
        data-testid="chat-input-area"
        className={cn('flex flex-col gap-2', className)}
        aria-label={t('chat.inputArea', 'Chat input area')}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isDragging && (
          <div className="flex items-center justify-center py-3 px-4 glass-panel border-dashed border-2 border-[var(--matrix-accent)] bg-[var(--matrix-accent)]/5 rounded-lg">
            <Paperclip size={18} className="text-[var(--matrix-accent)] mr-2" />
            <span className="text-sm text-[var(--matrix-accent)]">{t('chat.dropFilesHere', 'Drop files here')}</span>
          </div>
        )}

        <BaseChatInput
          ref={baseInputRef}
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={disabled}
          placeholder={placeholder}
          promptHistory={promptHistory}
          onPaste={handlePaste}
          topActions={
            <>
              <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
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
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInput}
                multiple
                accept={FILE_ACCEPT}
                className="hidden"
                tabIndex={-1}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className={cn(
                  'glass-button p-2.5 rounded-lg flex-shrink-0 transition-colors',
                  'hover:text-[var(--matrix-accent)]',
                  disabled && 'opacity-50 cursor-not-allowed',
                )}
                title={t('chat.attachFile', 'Attach file')}
                aria-label={t('chat.attachFile', 'Attach file')}
              >
                <Paperclip size={18} />
              </button>
            </>
          }
          rightActions={
            <motion.button
              type="button"
              onClick={() => handleSend(input)}
              disabled={!canSend}
              {...(canSend && { whileHover: { scale: 1.05 }, whileTap: { scale: 0.95 } })}
              className={cn(
                'glass-button glass-button-primary p-2.5 rounded-lg flex-shrink-0 transition-all',
                canSend
                  ? 'text-[var(--matrix-accent)] hover:shadow-[0_0_15px_var(--matrix-accent)]'
                  : 'opacity-50 cursor-not-allowed',
              )}
              title={t('chat.sendMessage', 'Send message')}
              aria-label={t('chat.sendMessage', 'Send message')}
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </motion.button>
          }
        />
      </section>
    );
  },
);

ChatInput.displayName = 'ChatInput';
