/**
 * Block 7: Feedback Loop System for AI Learning
 *
 * Features:
 * 1. Rating store - Zustand store for user ratings
 * 2. Code execution tracker - Track code copy events and success/failure
 * 3. Edit detection - Diff algorithm for user edits to AI responses
 * 4. Follow-up detector - Detect clarification questions
 * 5. Session quality score - Calculate overall session quality
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type Rating = 'up' | 'down' | null;

export interface FeedbackEntry {
  messageId: string;
  rating: Rating;
  edited: boolean;
  followUp: boolean;
  feedback?: string;
  timestamp: number;
}

export interface CodeCopyEvent {
  messageId: string;
  code: string;
  language?: string;
  timestamp: number;
  executionResult?: 'success' | 'failure' | 'unknown';
  userReported?: boolean;
}

export interface EditDiff {
  original: string;
  modified: string;
  changes: DiffChange[];
  similarity: number;
}

export interface DiffChange {
  type: 'add' | 'remove' | 'unchanged';
  value: string;
  lineNumber?: number;
}

export interface SessionQualityMetrics {
  totalMessages: number;
  upvotes: number;
  downvotes: number;
  completions: number;
  edits: number;
  followUps: number;
  codeCopies: number;
  successfulExecutions: number;
  failedExecutions: number;
  score: number;
}

// ============================================================================
// Feedback Store
// ============================================================================

interface FeedbackState {
  // Rating data
  ratings: Record<string, FeedbackEntry>;

  // Code copy tracking
  codeCopyEvents: CodeCopyEvent[];

  // Session metrics
  sessionMetrics: Record<string, SessionQualityMetrics>;

  // Current session ID
  currentSessionId: string | null;

  // Actions
  setRating: (messageId: string, rating: Rating, feedback?: string) => void;
  markEdited: (messageId: string) => void;
  markFollowUp: (messageId: string) => void;
  trackCodeCopy: (event: Omit<CodeCopyEvent, 'timestamp'>) => void;
  reportCodeExecution: (messageId: string, result: 'success' | 'failure') => void;
  incrementCompletions: (sessionId: string) => void;
  setCurrentSession: (sessionId: string) => void;
  getSessionMetrics: (sessionId: string) => SessionQualityMetrics;
  clearSessionFeedback: (sessionId: string) => void;
  getFeedbackEntry: (messageId: string) => FeedbackEntry | undefined;
  getAllRatings: () => FeedbackEntry[];
}

const defaultMetrics: SessionQualityMetrics = {
  totalMessages: 0,
  upvotes: 0,
  downvotes: 0,
  completions: 0,
  edits: 0,
  followUps: 0,
  codeCopies: 0,
  successfulExecutions: 0,
  failedExecutions: 0,
  score: 0,
};

export const useFeedbackStore = create<FeedbackState>()(
  persist(
    (set, get) => ({
      ratings: {},
      codeCopyEvents: [],
      sessionMetrics: {},
      currentSessionId: null,

      setRating: (messageId, rating, feedback) =>
        set((state) => {
          const existing = state.ratings[messageId];
          const sessionId = state.currentSessionId;

          // Update session metrics
          const updatedMetrics = { ...state.sessionMetrics };
          if (sessionId) {
            const metrics = updatedMetrics[sessionId] || { ...defaultMetrics };

            // Remove old rating from count
            if (existing?.rating === 'up') metrics.upvotes--;
            if (existing?.rating === 'down') metrics.downvotes--;

            // Add new rating to count
            if (rating === 'up') metrics.upvotes++;
            if (rating === 'down') metrics.downvotes++;

            // Recalculate score
            metrics.score = calculateScore(metrics);
            updatedMetrics[sessionId] = metrics;
          }

          return {
            ratings: {
              ...state.ratings,
              [messageId]: {
                messageId,
                rating,
                edited: existing?.edited ?? false,
                followUp: existing?.followUp ?? false,
                feedback,
                timestamp: Date.now(),
              },
            },
            sessionMetrics: updatedMetrics,
          };
        }),

      markEdited: (messageId) =>
        set((state) => {
          const existing = state.ratings[messageId];
          const sessionId = state.currentSessionId;

          const updatedMetrics = { ...state.sessionMetrics };
          if (sessionId && !existing?.edited) {
            const metrics = updatedMetrics[sessionId] || { ...defaultMetrics };
            metrics.edits++;
            metrics.score = calculateScore(metrics);
            updatedMetrics[sessionId] = metrics;
          }

          return {
            ratings: {
              ...state.ratings,
              [messageId]: {
                messageId,
                rating: existing?.rating ?? null,
                edited: true,
                followUp: existing?.followUp ?? false,
                feedback: existing?.feedback,
                timestamp: Date.now(),
              },
            },
            sessionMetrics: updatedMetrics,
          };
        }),

      markFollowUp: (messageId) =>
        set((state) => {
          const existing = state.ratings[messageId];
          const sessionId = state.currentSessionId;

          const updatedMetrics = { ...state.sessionMetrics };
          if (sessionId && !existing?.followUp) {
            const metrics = updatedMetrics[sessionId] || { ...defaultMetrics };
            metrics.followUps++;
            metrics.score = calculateScore(metrics);
            updatedMetrics[sessionId] = metrics;
          }

          return {
            ratings: {
              ...state.ratings,
              [messageId]: {
                messageId,
                rating: existing?.rating ?? null,
                edited: existing?.edited ?? false,
                followUp: true,
                feedback: existing?.feedback,
                timestamp: Date.now(),
              },
            },
            sessionMetrics: updatedMetrics,
          };
        }),

      trackCodeCopy: (event) =>
        set((state) => {
          const sessionId = state.currentSessionId;

          const updatedMetrics = { ...state.sessionMetrics };
          if (sessionId) {
            const metrics = updatedMetrics[sessionId] || { ...defaultMetrics };
            metrics.codeCopies++;
            metrics.score = calculateScore(metrics);
            updatedMetrics[sessionId] = metrics;
          }

          return {
            codeCopyEvents: [
              ...state.codeCopyEvents.slice(-999), // Keep last 1000 events
              {
                ...event,
                timestamp: Date.now(),
              },
            ],
            sessionMetrics: updatedMetrics,
          };
        }),

      reportCodeExecution: (messageId, result) =>
        set((state) => {
          const sessionId = state.currentSessionId;

          // Update the code copy event
          const updatedEvents = state.codeCopyEvents.map((event) => {
            if (event.messageId === messageId && event.executionResult === undefined) {
              return { ...event, executionResult: result, userReported: true };
            }
            return event;
          });

          // Update metrics
          const updatedMetrics = { ...state.sessionMetrics };
          if (sessionId) {
            const metrics = updatedMetrics[sessionId] || { ...defaultMetrics };
            if (result === 'success') {
              metrics.successfulExecutions++;
            } else {
              metrics.failedExecutions++;
            }
            metrics.score = calculateScore(metrics);
            updatedMetrics[sessionId] = metrics;
          }

          return {
            codeCopyEvents: updatedEvents,
            sessionMetrics: updatedMetrics,
          };
        }),

      incrementCompletions: (sessionId) =>
        set((state) => {
          const metrics = state.sessionMetrics[sessionId] || { ...defaultMetrics };
          metrics.completions++;
          metrics.totalMessages++;
          metrics.score = calculateScore(metrics);

          return {
            sessionMetrics: {
              ...state.sessionMetrics,
              [sessionId]: metrics,
            },
          };
        }),

      setCurrentSession: (sessionId) => set({ currentSessionId: sessionId }),

      getSessionMetrics: (sessionId) => {
        const state = get();
        return state.sessionMetrics[sessionId] || { ...defaultMetrics };
      },

      clearSessionFeedback: (sessionId) =>
        set((state) => {
          // Remove ratings for this session's messages
          const newRatings = { ...state.ratings };
          Object.keys(newRatings).forEach((key) => {
            if (key.startsWith(sessionId)) {
              delete newRatings[key];
            }
          });

          // Remove metrics
          const { [sessionId]: _removed, ...remainingMetrics } = state.sessionMetrics;

          return {
            ratings: newRatings,
            sessionMetrics: remainingMetrics,
          };
        }),

      getFeedbackEntry: (messageId) => get().ratings[messageId],

      getAllRatings: () => Object.values(get().ratings),
    }),
    {
      name: 'feedback-system-storage',
      partialize: (state) => ({
        ratings: state.ratings,
        codeCopyEvents: state.codeCopyEvents.slice(-100), // Persist only last 100
        sessionMetrics: state.sessionMetrics,
      }),
    },
  ),
);

// ============================================================================
// Feature 2: Code Execution Tracker
// ============================================================================

/**
 * Track when user copies code from AI response
 * Call this when the copy button is clicked on a code block
 */
export function trackCodeCopy(messageId: string, code: string, language?: string): void {
  const store = useFeedbackStore.getState();
  store.trackCodeCopy({
    messageId,
    code,
    language,
    executionResult: 'unknown',
  });
}

/**
 * Detect success/failure from user message content
 * Returns true if message indicates code execution result
 */
export function detectExecutionResult(userMessage: string): {
  detected: boolean;
  result: 'success' | 'failure' | null;
} {
  const lowerMessage = userMessage.toLowerCase();

  // Success indicators
  const successPatterns = [
    /it works?/i,
    /that works?/i,
    /perfect/i,
    /thanks?,? it('s| is) working/i,
    /got it working/i,
    /works? (great|perfectly|fine|now)/i,
    /dziala/i, // Polish: "works"
    /super/i,
    /ok,? dzieki/i, // Polish: "ok, thanks"
    /no error/i,
    /success(ful)?/i,
    /fixed/i,
  ];

  // Failure indicators
  const failurePatterns = [
    /doesn't work/i,
    /does not work/i,
    /not working/i,
    /still (get|getting|have|having|see|seeing) (an? )?error/i,
    /error/i,
    /exception/i,
    /crash(es|ed|ing)?/i,
    /fail(ed|s|ing)?/i,
    /broken/i,
    /bug/i,
    /nie dziala/i, // Polish: "doesn't work"
    /blad/i, // Polish: "error"
    /problem/i,
    /issue/i,
    /wrong/i,
  ];

  for (const pattern of successPatterns) {
    if (pattern.test(lowerMessage)) {
      return { detected: true, result: 'success' };
    }
  }

  for (const pattern of failurePatterns) {
    if (pattern.test(lowerMessage)) {
      return { detected: true, result: 'failure' };
    }
  }

  return { detected: false, result: null };
}

// ============================================================================
// Feature 3: Edit Detection (Diff Algorithm)
// ============================================================================

/**
 * Simple diff algorithm to detect user edits to AI responses
 * Uses Levenshtein distance-based approach for change detection
 */
export function detectEdit(original: string, modified: string): EditDiff {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  const changes: DiffChange[] = [];
  const _maxLen = Math.max(originalLines.length, modifiedLines.length);
  void _maxLen; // Used for debugging

  // Simple line-by-line comparison with LCS-inspired approach
  let matchedChars = 0;
  const totalChars = Math.max(original.length, modified.length);

  // Use a simple diff approach
  let i = 0;
  let j = 0;

  while (i < originalLines.length || j < modifiedLines.length) {
    if (i >= originalLines.length) {
      // Rest are additions
      changes.push({
        type: 'add',
        value: modifiedLines[j],
        lineNumber: j + 1,
      });
      j++;
    } else if (j >= modifiedLines.length) {
      // Rest are removals
      changes.push({
        type: 'remove',
        value: originalLines[i],
        lineNumber: i + 1,
      });
      i++;
    } else if (originalLines[i] === modifiedLines[j]) {
      // Lines match
      changes.push({
        type: 'unchanged',
        value: originalLines[i],
        lineNumber: i + 1,
      });
      matchedChars += originalLines[i].length;
      i++;
      j++;
    } else {
      // Lines differ - check if it's a modification or add/remove
      const lookAheadOriginal = originalLines.slice(i + 1, i + 4).indexOf(modifiedLines[j]);
      const lookAheadModified = modifiedLines.slice(j + 1, j + 4).indexOf(originalLines[i]);

      if (
        lookAheadOriginal !== -1 &&
        (lookAheadModified === -1 || lookAheadOriginal <= lookAheadModified)
      ) {
        // Original line was removed
        changes.push({
          type: 'remove',
          value: originalLines[i],
          lineNumber: i + 1,
        });
        i++;
      } else if (lookAheadModified !== -1) {
        // New line was added
        changes.push({
          type: 'add',
          value: modifiedLines[j],
          lineNumber: j + 1,
        });
        j++;
      } else {
        // Line was modified (count as remove + add)
        changes.push({
          type: 'remove',
          value: originalLines[i],
          lineNumber: i + 1,
        });
        changes.push({
          type: 'add',
          value: modifiedLines[j],
          lineNumber: j + 1,
        });
        i++;
        j++;
      }
    }
  }

  // Calculate similarity using Levenshtein-inspired metric
  const similarity =
    totalChars > 0 ? (matchedChars / totalChars) * 100 : original === modified ? 100 : 0;

  return {
    original,
    modified,
    changes,
    similarity: Math.round(similarity * 100) / 100,
  };
}

/**
 * Check if a message has been significantly edited
 * Returns true if similarity is below threshold
 */
export function hasSignificantEdit(original: string, modified: string, threshold = 90): boolean {
  if (original === modified) return false;
  const diff = detectEdit(original, modified);
  return diff.similarity < threshold;
}

// ============================================================================
// Feature 4: Follow-up Detector
// ============================================================================

// Common clarification question patterns
const FOLLOW_UP_PATTERNS: RegExp[] = [
  // English patterns
  /^what do you mean/i,
  /^what does that mean/i,
  /^can you explain/i,
  /^could you explain/i,
  /^please explain/i,
  /^i don't understand/i,
  /^i don't get/i,
  /^what is\s+.+\s*\?$/i,
  /^what are\s+.+\s*\?$/i,
  /^how does\s+.+\s*work/i,
  /^how do i/i,
  /^how can i/i,
  /^why (does|is|are|did|do)/i,
  /^can you clarify/i,
  /^could you clarify/i,
  /^what's the difference/i,
  /^i'm confused/i,
  /^not sure (what|how|why)/i,
  /^elaborate/i,
  /^more details/i,
  /^can you give (me )?an example/i,
  /^example\??$/i,
  /^for example\??$/i,
  /\?{2,}$/, // Multiple question marks indicate confusion

  // Polish patterns
  /^co masz na mysli/i,
  /^co to znaczy/i,
  /^mozesz wyjasnic/i,
  /^nie rozumiem/i,
  /^jak to dziala/i,
  /^dlaczego/i,
  /^wyjasni(j|c)/i,
  /^co to jest/i,
  /^jak mam/i,
  /^o co chodzi/i,
  /^podaj przyklad/i,
];

// Keywords that suggest clarification needs
const FOLLOW_UP_KEYWORDS = [
  'unclear',
  'confusing',
  'confused',
  "don't understand",
  "doesn't make sense",
  'what exactly',
  'more specific',
  'be more clear',
  'elaborate',
  'clarification',
  'meaning',
  'niejasne',
  'nie rozumiem',
  'wyjasnienie',
];

/**
 * Detect if a message is a follow-up/clarification question
 */
export function isFollowUp(message: string): boolean {
  const trimmedMessage = message.trim();

  // Check against patterns
  for (const pattern of FOLLOW_UP_PATTERNS) {
    if (pattern.test(trimmedMessage)) {
      return true;
    }
  }

  // Check for keywords
  const lowerMessage = trimmedMessage.toLowerCase();
  for (const keyword of FOLLOW_UP_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      return true;
    }
  }

  // Short message with question mark often indicates follow-up
  if (trimmedMessage.length < 50 && trimmedMessage.endsWith('?')) {
    // Check if it's a simple clarification vs new question
    const wordsCount = trimmedMessage.split(/\s+/).length;
    if (wordsCount <= 8) {
      return true;
    }
  }

  return false;
}

/**
 * Analyze message for follow-up indicators and return confidence score
 */
export function analyzeFollowUp(message: string): {
  isFollowUp: boolean;
  confidence: number;
  matchedPatterns: string[];
} {
  const trimmedMessage = message.trim();
  const matchedPatterns: string[] = [];
  let confidence = 0;

  // Check patterns
  for (const pattern of FOLLOW_UP_PATTERNS) {
    if (pattern.test(trimmedMessage)) {
      matchedPatterns.push(pattern.source);
      confidence += 30;
    }
  }

  // Check keywords
  const lowerMessage = trimmedMessage.toLowerCase();
  for (const keyword of FOLLOW_UP_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      matchedPatterns.push(`keyword:${keyword}`);
      confidence += 20;
    }
  }

  // Short question bonus
  if (trimmedMessage.length < 50 && trimmedMessage.endsWith('?')) {
    confidence += 15;
  }

  // Cap at 100
  confidence = Math.min(confidence, 100);

  return {
    isFollowUp: confidence >= 30,
    confidence,
    matchedPatterns,
  };
}

// ============================================================================
// Feature 5: Session Quality Score
// ============================================================================

/**
 * Calculate session quality score
 * Formula: (upvotes - downvotes + completions) / totalMessages * 100
 * Adjusted for edits and follow-ups (negative indicators)
 */
function calculateScore(metrics: SessionQualityMetrics): number {
  const {
    totalMessages,
    upvotes,
    downvotes,
    completions,
    edits,
    followUps,
    successfulExecutions,
    failedExecutions,
  } = metrics;

  if (totalMessages === 0) return 0;

  // Base score from ratings
  const ratingScore = upvotes - downvotes;

  // Completion bonus (indicates task success)
  const completionBonus = completions * 0.5;

  // Edit penalty (user had to fix AI response)
  const editPenalty = edits * 0.3;

  // Follow-up penalty (AI wasn't clear enough)
  const followUpPenalty = followUps * 0.2;

  // Execution success/failure
  const executionScore = successfulExecutions * 0.5 - failedExecutions * 0.5;

  // Calculate final score
  const rawScore = ratingScore + completionBonus - editPenalty - followUpPenalty + executionScore;
  const normalizedScore = (rawScore / totalMessages) * 100;

  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, Math.round(normalizedScore * 100) / 100));
}

/**
 * Calculate and return detailed session quality metrics
 */
export function calculateSessionScore(sessionId: string): SessionQualityMetrics {
  const store = useFeedbackStore.getState();
  const metrics = store.sessionMetrics[sessionId] || { ...defaultMetrics };

  // Ensure score is up to date
  metrics.score = calculateScore(metrics);

  return metrics;
}

/**
 * Get a human-readable quality assessment
 */
export function getQualityAssessment(score: number): {
  label: string;
  color: string;
  emoji: string;
} {
  if (score >= 80) {
    return { label: 'Excellent', color: '#22c55e', emoji: '🌟' };
  } else if (score >= 60) {
    return { label: 'Good', color: '#84cc16', emoji: '👍' };
  } else if (score >= 40) {
    return { label: 'Fair', color: '#eab308', emoji: '📊' };
  } else if (score >= 20) {
    return { label: 'Poor', color: '#f97316', emoji: '⚠️' };
  } else {
    return { label: 'Needs Improvement', color: '#ef4444', emoji: '❌' };
  }
}

// ============================================================================
// Re-export types for convenience (already exported at definition)
// ============================================================================

// All types are exported at their definition point:
// - Rating, FeedbackEntry, CodeCopyEvent, EditDiff, DiffChange, SessionQualityMetrics
