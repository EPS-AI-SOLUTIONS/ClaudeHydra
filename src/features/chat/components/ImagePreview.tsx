import { X } from 'lucide-react';
import { memo } from 'react';

interface ImagePreviewProps {
  src: string;
  onRemove: () => void;
}

export const ImagePreview = memo(function ImagePreview({ src, onRemove }: ImagePreviewProps) {
  return (
    <div className="relative inline-block mt-2">
      <img src={src} alt="Preview" className="h-16 w-16 object-cover rounded-md border border-[var(--glass-border)]" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-2 -right-2 bg-black/60 text-white rounded-full p-0.5 hover:bg-red-500 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
});

ImagePreview.displayName = 'ImagePreview';
