import { useCallback } from 'react';

interface UseChatFileHandlerProps {
  onPasteImage?: (base64: string) => void;
  onPasteFile?: (content: string, filename: string) => void;
}

export function useChatFileHandler({ onPasteImage, onPasteFile }: UseChatFileHandlerProps) {
  const handlePaste = useCallback((e: any) => {
    // Stub implementation
  }, []);

  const handleDrop = useCallback((e: any) => {
    // Stub implementation
  }, []);

  const handleFileSelect = useCallback((e: any) => {
    // Stub implementation
  }, []);

  return { handlePaste, handleDrop, handleFileSelect };
}
