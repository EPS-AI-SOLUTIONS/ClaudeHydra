import { Code2, Maximize2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CodeBlock } from '@/components/molecules/CodeBlock';
import { cn } from '@/shared/utils/cn';
import { useViewStore } from '@/stores/viewStore';

export const ArtifactPanel = memo(function ArtifactPanel() {
  const { activeArtifact, setActiveArtifact } = useViewStore(
    useShallow((s) => ({
      activeArtifact: s.activeArtifact,
      setActiveArtifact: s.setActiveArtifact,
    })),
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isHtml = activeArtifact?.language === 'html' || activeArtifact?.language === 'svg';
  const [mode, setMode] = useState<'code' | 'preview'>(isHtml ? 'preview' : 'code');

  if (!activeArtifact) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, width: 0 }}
      animate={{ opacity: 1, x: 0, width: isFullscreen ? '100%' : '50%' }}
      exit={{ opacity: 0, x: 50, width: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn(
        'h-full flex flex-col border-l border-[var(--glass-border)] bg-[var(--matrix-bg-primary)] z-20 shrink-0 relative overflow-hidden',
        isFullscreen ? 'absolute inset-0' : '',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)] bg-[var(--matrix-bg-secondary)]/50 shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <Code2 size={16} className="text-[var(--matrix-accent)] shrink-0" />
          <span className="text-sm font-semibold truncate text-[var(--matrix-text-primary)]">
            {activeArtifact.title || 'Artifact'}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--matrix-accent)]/10 text-[var(--matrix-accent)] uppercase tracking-wider font-mono shrink-0">
            {activeArtifact.language}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isHtml && (
            <div className="flex bg-[var(--matrix-bg-tertiary)] rounded-md p-0.5 mr-2">
              <button
                type="button"
                onClick={() => setMode('preview')}
                className={cn(
                  'px-2 py-1 rounded text-xs transition-colors',
                  mode === 'preview'
                    ? 'bg-[var(--matrix-accent)]/20 text-[var(--matrix-accent)]'
                    : 'text-[var(--matrix-text-secondary)]',
                )}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setMode('code')}
                className={cn(
                  'px-2 py-1 rounded text-xs transition-colors',
                  mode === 'code'
                    ? 'bg-[var(--matrix-accent)]/20 text-[var(--matrix-accent)]'
                    : 'text-[var(--matrix-text-secondary)]',
                )}
              >
                Code
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-md hover:bg-[var(--matrix-accent)]/10 text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-accent)] transition-colors"
            title="Toggle Fullscreen"
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => setActiveArtifact(null)}
            className="p-1.5 rounded-md hover:bg-red-500/20 text-[var(--matrix-text-secondary)] hover:text-red-400 transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 relative bg-[var(--matrix-bg-primary)]">
        {mode === 'preview' && isHtml ? (
          <iframe
            srcDoc={activeArtifact.code}
            className="w-full h-full border-none bg-white"
            title="Preview"
            sandbox="allow-scripts allow-forms"
          />
        ) : (
          <div className="h-full overflow-auto p-4 scrollbar-thin">
            <CodeBlock
              code={activeArtifact.code}
              language={activeArtifact.language}
              showLineNumbers
              maxHeight="100%"
              className="m-0 border-none rounded-none !bg-transparent h-full shadow-none"
            />
          </div>
        )}
      </div>
    </motion.div>
  );
});
