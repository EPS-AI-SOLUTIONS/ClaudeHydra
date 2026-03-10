import { memo } from 'react';

interface MessageRatingProps {
  sessionId: string;
  messageId: string;
}

export const MessageRating = memo(function MessageRating({ sessionId, messageId }: MessageRatingProps) {
  // Stub implementation
  return null;
});

MessageRating.displayName = 'MessageRating';
