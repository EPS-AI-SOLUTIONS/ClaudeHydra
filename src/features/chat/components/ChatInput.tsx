/**
 * ChatInput — Composable textarea input with send button, file attachment,
 * and keyboard shortcut support.
 *
 * Ported from ClaudeHydra v3 `OllamaChatView.tsx` inline input area.
 * ClaudeHydra-v4: Extracted as a standalone component for reuse and testing.
 */

import { Loader2, Paperclip, Send } from 'lucide-react';
import { motion } from 'motion/react';
import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  forwardRef,
  type KeyboardEvent,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useTextareaAutoResize } from '@/shared/hooks/useTextareaAutoResize';
import { cn } from '@/shared/utils/cn';
import { AttachmentPreview } from './AttachmentPreview';
import { WorkingFolderPicker } from './WorkingFolderPicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Attachment {
  id: string;
  name: string;
  type: 'file' | 'image';
  content: string;
  mimeType: string;
}

interface ChatInputProps {
  /** Called when the user submits the message */
  onSend: (message: string, attachments: Attachment[]) => void;
  /** Whether the input should be disabled (e.g. during streaming) */
  disabled?: boolean;
  /** Whether the chat is currently loading / streaming */
  isLoading?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Extra CSS classes on root wrapper */
  className?: string;
  /** Previous user prompts for arrow-key navigation (newest last). */
  promptHistory?: string[];
  /** Per-session working directory props */
  sessionId?: string;
  workingDirectory?: string;
  onWorkingDirectoryChange?: (wd: string) => void;
}

export interface ChatInputHandle {
  focus: () => void;
  clear: () => void;
  setValue: (text: string) => void;
}

// ---------------------------------------------------------------------------
// File accept list
// ---------------------------------------------------------------------------

const FILE_ACCEPT = 'image/*,.txt,.md,.json,.js,.ts,.py,.rs,.go,.java,.cpp,.c,.h,.css,.html,.xml,.yaml,.yml,.toml,.sh';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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

    // Prompt history navigation
    const [historyIndex, setHistoryIndex] = useState(-1);
    const savedDraftRef = useRef('');

    // Reset history index when session changes (global history persists across sessions)
    const prevSessionRef = useRef(sessionId);
    if (prevSessionRef.current !== sessionId) {
      prevSessionRef.current = sessionId;
      setHistoryIndex(-1);
      savedDraftRef.current = '';
    }

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Shared auto-resize hook (Jaskier Shared Pattern)
    const adjustHeight = useTextareaAutoResize({
      textareaRef,
      lineHeight: 24,
      minRows: 2,
      maxRows: 8,
    });

    // Expose imperative methods
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      clear: () => {
        setInput('');
        setAttachments([]);
      },
      setValue: (text: string) => {
        setInput(text);
        requestAnimationFrame(() => {
          adjustHeight();
          textareaRef.current?.focus();
        });
      },
    }));

    // ----- File processing ------------------------------------------------

    const processFile = useCallback(async (file: File) => {
      const reader = new FileReader();
      return new Promise<void>((resolve) => {
        reader.onload = (e) => {
          const content = e.target?.result as string;
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
        if (file.type.startsWith('image/')) {
          reader.readAsDataURL(file);
        } else {
          reader.readAsText(file);
        }
      });
    }, []);

    const handleFileInput = useCallback(
      async (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
          for (const file of Array.from(files)) {
            await processFile(file);
          }
        }
        // Reset input so same file can be re-selected
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      [processFile],
    );

    const removeAttachment = useCallback((id: string) => {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    }, []);

    // ----- Drag & Drop ---------------------------------------------------

    const handleDrop = useCallback(
      async (e: DragEvent<HTMLDivElement>) => {
        if (!e.dataTransfer?.types.includes('Files')) return;
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files.length > 0) {
          const files = Array.from(e.dataTransfer.files);
          for (const file of files) {
            await processFile(file);
          }
        }
      },
      [processFile],
    );

    const handleTextareaDrop = useCallback(
      (e: DragEvent<HTMLTextAreaElement>) => {
        const text = e.dataTransfer.getData('text/plain');
        if (text && e.dataTransfer.files.length === 0) {
          const lines = text.split('\n');
          if (lines.length > 10) {
            e.preventDefault();
            e.stopPropagation();
            const file = new File([text.substring(0, 50000)], `Zrzut $($lines.length) linii.txt`, {
              type: 'text/plain',
            });
            void processFile(file);
          }
        }
      },
      [processFile],
    );

    const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setIsDragging(false);
    }, []);

    // ----- Send logic ----------------------------------------------------

    const canSend = (input.trim().length > 0 || attachments.length > 0) && !disabled && !isLoading;

    const handleSend = useCallback(() => {
      if (!canSend) return;
      onSend(input.trim(), attachments);
      setInput('');
      setAttachments([]);
      // Re-focus textarea
      requestAnimationFrame(() => textareaRef.current?.focus());
    }, [canSend, input, attachments, onSend]);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handleSend();
          setHistoryIndex(-1);
          savedDraftRef.current = '';
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          const el = e.currentTarget;
          const { selectionStart, selectionEnd } = el;
          const newValue = `${input.substring(0, selectionStart)}\n${input.substring(selectionEnd)}`;
          setInput(newValue);
          requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = selectionStart + 1;
            adjustHeight();
          });
        } else if (e.key === 'ArrowUp' && promptHistory.length > 0) {
          const el = e.currentTarget;
          const isAtStart = el.selectionStart === 0 && el.selectionEnd === 0;
          const isSingleLine = !input.includes('\n');
          if (isAtStart || (isSingleLine && historyIndex === -1)) {
            e.preventDefault();
            if (historyIndex === -1) {
              savedDraftRef.current = input;
            }
            const nextIndex = historyIndex === -1 ? promptHistory.length - 1 : Math.max(0, historyIndex - 1);
            setHistoryIndex(nextIndex);
            const historyValue = promptHistory[nextIndex] ?? '';
            setInput(historyValue);
            requestAnimationFrame(() => {
              if (textareaRef.current) {
                textareaRef.current.selectionStart = textareaRef.current.selectionEnd = historyValue.length;
                adjustHeight();
              }
            });
          }
        } else if (e.key === 'ArrowDown' && historyIndex >= 0) {
          const el = e.currentTarget;
          const isAtEnd = el.selectionStart === input.length;
          const isSingleLine = !input.includes('\n');
          if (isAtEnd || isSingleLine) {
            e.preventDefault();
            if (historyIndex >= promptHistory.length - 1) {
              setHistoryIndex(-1);
              const draft = savedDraftRef.current;
              setInput(draft);
              requestAnimationFrame(() => adjustHeight());
            } else {
              const nextIndex = historyIndex + 1;
              setHistoryIndex(nextIndex);
              const historyValue = promptHistory[nextIndex] ?? '';
              setInput(historyValue);
              requestAnimationFrame(() => adjustHeight());
            }
          }
        }
      },
      [handleSend, input, promptHistory, historyIndex, adjustHeight],
    );

    // ----- Paste handler (images and large text from clipboard) ------------

    const handlePaste = useCallback(
      (e: ClipboardEvent<HTMLTextAreaElement>) => {
        const text = e.clipboardData?.getData('text/plain');
        if (text) {
          const lines = text.split('\n');
          if (lines.length > 10) {
            e.preventDefault();
            const file = new File([text.substring(0, 50000)], `Wklejono $($lines.length) linii.txt`, {
              type: 'text/plain',
            });
            void processFile(file);
            return;
          }
        }

        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of Array.from(items)) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) void processFile(file);
            return;
          }
        }
      },
      [processFile],
    );

    // ----- Auto-resize textarea ------------------------------------------

    const handleChange = useCallback(
      (e: ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        adjustHeight();
      },
      [adjustHeight],
    );

    // ----- Render --------------------------------------------------------

    return (
      <section
        data-testid="chat-input-area"
        className={cn('flex flex-col gap-2', className)}
        aria-label={t('chat.inputArea', 'Chat input area')}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Drag overlay indicator */}
        {isDragging && (
          <div className="flex items-center justify-center py-3 px-4 glass-panel border-dashed border-2 border-[var(--matrix-accent)] bg-[var(--matrix-accent)]/5 rounded-lg">
            <Paperclip size={18} className="text-[var(--matrix-accent)] mr-2" />
            <span className="text-sm text-[var(--matrix-accent)]">{t('chat.dropFilesHere', 'Drop files here')}</span>
          </div>
        )}

        {/* Attachments preview (extracted component) */}
        <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />

        {/* Per-session working folder picker */}
        {sessionId && onWorkingDirectoryChange && (
          <WorkingFolderPicker
            sessionId={sessionId}
            workingDirectory={workingDirectory ?? ''}
            onDirectoryChange={onWorkingDirectoryChange}
          />
        )}

        {/* Input row */}
        <div className="flex gap-2 items-end">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            multiple
            accept={FILE_ACCEPT}
            className="hidden"
            tabIndex={-1}
          />

          {/* Attach button */}
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

          {/* Textarea */}
          <div className="flex-1 relative group">
            <textarea
              ref={textareaRef}
              data-testid="chat-textarea"
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onDrop={handleTextareaDrop}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className={cn(
                'w-full glass-input px-4 py-3 resize-none rounded-lg pr-24 scrollbar-hide font-mono text-sm',
                'text-[var(--matrix-text-primary)] placeholder:text-[var(--matrix-text-secondary)]/60',
                'focus:border-[var(--matrix-accent)] focus:ring-2 focus:ring-[var(--matrix-accent)]/30',
                'outline-none transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              style={{ minHeight: '48px', maxHeight: '200px' }}
            />
          </div>

          {/* Send button */}
          <motion.button
            type="button"
            data-testid="chat-send-btn"
            onClick={handleSend}
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
        </div>
      </section>
    );
  },
);

ChatInput.displayName = 'ChatInput';
