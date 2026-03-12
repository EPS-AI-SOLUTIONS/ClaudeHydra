import { useViewTheme } from '@jaskier/chat-module';
import { BaseArtifactView, cn } from '@jaskier/ui';
import { motion } from 'motion/react';
import { memo, useState } from 'react';
import { useViewStore } from '@/stores/viewStore';

export const ArtifactPanel = memo(function ArtifactPanel() {
  const theme = useViewTheme();
  const activeArtifact = useViewStore((s) => s.activeArtifact);
  const setActiveArtifact = useViewStore((s) => s.setActiveArtifact);
  const [isFullscreen] = useState(false);

  if (!activeArtifact) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, width: 0 }}
      animate={{ opacity: 1, x: 0, width: isFullscreen ? '100%' : '50%' }}
      exit={{ opacity: 0, x: 50, width: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn(
        'h-full flex flex-col border-l border-[var(--matrix-accent)]/20 bg-black/40 backdrop-blur-md z-20 shrink-0 relative overflow-hidden',
        isFullscreen ? 'absolute inset-0' : '',
        theme.glassPanel,
        'rounded-r-xl rounded-l-none border-y-0 border-r-0',
      )}
    >
      <BaseArtifactView
        content={activeArtifact.code}
        language={activeArtifact.language}
        title={activeArtifact.title}
        onClose={() => setActiveArtifact(null)}
      />
    </motion.div>
  );
});
