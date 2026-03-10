/**
 * PartnerChatModal — read-only overlay showing a GeminiHydra conversation.
 */

import { cn } from '@jaskier/ui';
import { Bot, Loader2, User, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { usePartnerSession } from '@/features/chat/hooks/usePartnerSessions';
import { useFocusTrap } from '@/shared/hooks/useFocusTrap';
import { formatTime } from '@/shared/utils/locale';

interface Props {
  sessionId: string | null;
  onClose: () => void;
}

export default function PartnerChatModal({ sessionId, onClose }: Props) {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const { data: session, isLoading, error } = usePartnerSession(sessionId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // #47 — Focus trap
  useFocusTrap(modalRef, { active: !!sessionId, onEscape: onClose });

  useEffect(() => {
    if (session && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session]);

  return createPortal(
    <AnimatePresence>
      {sessionId && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
            onClick={onClose}
          />
          {/* Modal (#47 focus trap) */}
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="partner-chat-modal-title"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={cn(
              'fixed inset-4 md:inset-12 lg:inset-20 z-[9999] flex flex-col rounded-2xl border overflow-hidden',
              isLight
                ? 'bg-white/95 border-slate-200 shadow-2xl'
                : 'bg-[#0a0a0f]/95 border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.8)]',
            )}
          >
            {/* Header */}
            <div
              className={cn(
                'flex items-center justify-between px-5 py-3 border-b',
                isLight ? 'border-slate-200 bg-slate-50/80' : 'border-white/10 bg-white/5',
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold',
                    isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400',
                  )}
                >
                  GH
                </div>
                <div>
                  <h2
                    id="partner-chat-modal-title"
                    className={cn('text-sm font-semibold', isLight ? 'text-slate-900' : 'text-white')}
                  >
                    {session?.title ?? 'Loading...'}
                  </h2>
                  <p className={cn('text-xs', isLight ? 'text-slate-500' : 'text-white/50')}>
                    GeminiHydra Session {session ? `(${session.messages.length} messages)` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={cn('p-2 rounded-lg transition-colors', isLight ? 'hover:bg-slate-200' : 'hover:bg-white/10')}
              >
                <X size={18} className={isLight ? 'text-slate-600' : 'text-white/60'} />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoading && (
                <div className="flex items-center justify-center h-full">
                  <Loader2 size={24} className="animate-spin text-blue-500" />
                </div>
              )}
              {error && (
                <div className={cn('text-center py-8 text-sm', isLight ? 'text-red-600' : 'text-red-400')}>
                  Failed to load session
                </div>
              )}
              {session?.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn('flex gap-3 max-w-3xl', msg.role === 'user' ? 'ml-auto flex-row-reverse' : '')}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                      msg.role === 'user'
                        ? isLight
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-emerald-500/20 text-emerald-400'
                        : isLight
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-blue-500/20 text-blue-400',
                    )}
                  >
                    {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div
                    className={cn(
                      'flex-1 min-w-0 rounded-xl px-4 py-2.5',
                      msg.role === 'user'
                        ? isLight
                          ? 'bg-emerald-50 text-slate-800'
                          : 'bg-emerald-500/10 text-white/90'
                        : isLight
                          ? 'bg-slate-100 text-slate-800'
                          : 'bg-white/5 text-white/90',
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    <div className={cn('flex items-center gap-2 mt-1.5', isLight ? 'text-slate-400' : 'text-white/30')}>
                      {msg.model && <span className="text-[10px] font-mono">{msg.model}</span>}
                      <span className="text-[10px]">{formatTime(msg.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div
              className={cn(
                'px-5 py-2.5 border-t text-center',
                isLight ? 'border-slate-200 bg-slate-50/80' : 'border-white/10 bg-white/5',
              )}
            >
              <span className={cn('text-xs', isLight ? 'text-slate-400' : 'text-white/30')}>
                Read-only view from GeminiHydra
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
