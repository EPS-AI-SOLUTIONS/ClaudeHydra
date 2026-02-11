/**
 * ClaudeGUI - DragDropZone Component
 * @module components/chat/DragDropZone
 *
 * Overlay for drag & drop file uploads.
 * Ported from GeminiHydra.
 */

import { Paperclip } from 'lucide-react';
import { type DragEvent, memo, type ReactNode, useCallback, useState } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface DragDropZoneProps {
  children: ReactNode;
  onImageDrop: (base64: string) => void;
  onTextDrop: (content: string, filename: string) => void;
  maxFileSizeMB?: number;
}

// ============================================================================
// OVERLAY
// ============================================================================

const DropOverlay = memo(() => (
  <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center border-4 border-[var(--matrix-accent)] border-dashed rounded-xl pointer-events-none">
    <div className="text-[var(--matrix-accent)] text-2xl font-mono animate-pulse flex flex-col items-center gap-4">
      <Paperclip size={64} />
      <span>UPUSC PLIK, ABY DODAC KONTEKST</span>
    </div>
  </div>
));

DropOverlay.displayName = 'DropOverlay';

// ============================================================================
// COMPONENT
// ============================================================================

export const DragDropZone = memo<DragDropZoneProps>(
  ({ children, onImageDrop, onTextDrop, maxFileSizeMB = 5 }) => {
    const [isDragActive, setIsDragActive] = useState(false);

    const handleDrag = useCallback((e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'dragenter' || e.type === 'dragover') {
        setIsDragActive(true);
      } else if (e.type === 'dragleave') {
        setIsDragActive(false);
      }
    }, []);

    const handleDrop = useCallback(
      (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        if (e.dataTransfer.files?.[0]) {
          const file = e.dataTransfer.files[0];
          const maxSize = maxFileSizeMB * 1024 * 1024;

          if (file.size > maxSize) {
            alert(`Plik zbyt duzy. Maksymalnie ${maxFileSizeMB}MB.`);
            return;
          }

          const reader = new FileReader();

          if (file.type.startsWith('image/')) {
            reader.onload = (event) => {
              if (event.target?.result) {
                onImageDrop(event.target.result as string);
              }
            };
            reader.readAsDataURL(file);
          } else {
            reader.onload = (event) => {
              if (event.target?.result) {
                const content = event.target.result as string;
                onTextDrop(content.substring(0, 20000), file.name);
              }
            };
            reader.readAsText(file);
          }
        }
      },
      [onImageDrop, onTextDrop, maxFileSizeMB],
    );

    return (
      <section
        className="flex flex-col h-full min-h-0 relative"
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {isDragActive && <DropOverlay />}
        {children}
      </section>
    );
  },
);

DragDropZone.displayName = 'DragDropZone';

export default DragDropZone;
