import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';
import type { ChatSession, ChatSessionSummary } from './useChatHistory';

// AI-generated metadata for sessions
export interface SessionAIMetadata {
  smartTitle?: string;
  summary?: string;
  tags?: string[];
  embedding?: number[];
  lastProcessed?: string;
}

// Session with AI metadata
export interface EnhancedSession extends ChatSessionSummary {
  ai?: SessionAIMetadata;
  similarity?: number; // For related sessions
}

// Predefined tags for auto-tagging
const AVAILABLE_TAGS = [
  'coding',
  'debugging',
  'architecture',
  'documentation',
  'refactoring',
  'testing',
  'devops',
  'database',
  'api',
  'frontend',
  'backend',
  'security',
  'performance',
  'learning',
  'brainstorming',
  'review',
];

// Prompts for AI operations
const PROMPTS = {
  smartTitle: `Analyze this conversation and generate a short, descriptive title (max 6 words) that captures the main topic. Return ONLY the title, no quotes or explanation.

Conversation:
{content}

Title:`,

  summary: `Summarize this conversation in 2-3 sentences. Focus on the main problem discussed and any solutions or conclusions reached. Be concise.

Conversation:
{content}

Summary:`,

  tags: `Analyze this conversation and select 1-4 relevant tags from this list: ${AVAILABLE_TAGS.join(', ')}.
Return ONLY the tags as comma-separated values, nothing else.

Conversation:
{content}

Tags:`,

  embedding: `Extract the key semantic concepts from this conversation as a comma-separated list of keywords (max 20 keywords).

Conversation:
{content}

Keywords:`,
};

// Helper to truncate content for prompts
function truncateContent(content: string, maxLength: number = 4000): string {
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength)}\n... [truncated]`;
}

// Helper to format session content for AI
function formatSessionContent(session: ChatSession): string {
  return session.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
}

export function useSessionAI() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTask, setProcessingTask] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if Ollama is available
  const checkOllama = useCallback(async (): Promise<boolean> => {
    try {
      return await invoke<boolean>('ollama_health_check');
    } catch {
      return false;
    }
  }, []);

  // Get best available model for text tasks
  const getBestModel = useCallback(async (): Promise<string | null> => {
    try {
      const models = await invoke<{ name: string }[]>('ollama_list_models');
      if (models.length === 0) return null;

      // Prefer smaller, faster models for metadata tasks
      const preferredModels = [
        'llama3.2:1b',
        'llama3.2:3b',
        'phi3:mini',
        'qwen2.5-coder:1.5b',
        'mistral:7b',
      ];

      for (const preferred of preferredModels) {
        const found = models.find((m) => m.name.includes(preferred.split(':')[0]));
        if (found) return found.name;
      }

      return models[0].name;
    } catch {
      return null;
    }
  }, []);

  // Generate text using Ollama
  const generateText = useCallback(
    async (prompt: string): Promise<string> => {
      const model = await getBestModel();
      if (!model) throw new Error('No Ollama models available');

      // Use invoke to call ollama_generate
      const response = await invoke<string>('ollama_generate_sync', {
        model,
        prompt,
        options: {
          temperature: 0.3,
          num_predict: 256,
        },
      });

      return response.trim();
    },
    [getBestModel],
  );

  // Generate smart title for a session
  const generateSmartTitle = useCallback(
    async (session: ChatSession): Promise<string> => {
      setIsProcessing(true);
      setProcessingTask('Generating title...');
      setError(null);

      try {
        const content = truncateContent(formatSessionContent(session), 2000);
        const prompt = PROMPTS.smartTitle.replace('{content}', content);
        const title = await generateText(prompt);

        // Clean up the title
        return title
          .replace(/^["']|["']$/g, '')
          .replace(/^Title:\s*/i, '')
          .slice(0, 60);
      } catch (e) {
        setError(`Failed to generate title: ${e}`);
        throw e;
      } finally {
        setIsProcessing(false);
        setProcessingTask(null);
      }
    },
    [generateText],
  );

  // Generate summary for a session
  const generateSummary = useCallback(
    async (session: ChatSession): Promise<string> => {
      setIsProcessing(true);
      setProcessingTask('Generating summary...');
      setError(null);

      try {
        const content = truncateContent(formatSessionContent(session), 3000);
        const prompt = PROMPTS.summary.replace('{content}', content);
        return await generateText(prompt);
      } catch (e) {
        setError(`Failed to generate summary: ${e}`);
        throw e;
      } finally {
        setIsProcessing(false);
        setProcessingTask(null);
      }
    },
    [generateText],
  );

  // Generate tags for a session
  const generateTags = useCallback(
    async (session: ChatSession): Promise<string[]> => {
      setIsProcessing(true);
      setProcessingTask('Generating tags...');
      setError(null);

      try {
        const content = truncateContent(formatSessionContent(session), 2000);
        const prompt = PROMPTS.tags.replace('{content}', content);
        const response = await generateText(prompt);

        // Parse tags from response
        const tags = response
          .toLowerCase()
          .split(/[,\n]/)
          .map((t) => t.trim())
          .filter((t) => AVAILABLE_TAGS.includes(t));

        return [...new Set(tags)].slice(0, 4);
      } catch (e) {
        setError(`Failed to generate tags: ${e}`);
        throw e;
      } finally {
        setIsProcessing(false);
        setProcessingTask(null);
      }
    },
    [generateText],
  );

  // Generate keywords for embedding/search
  const generateKeywords = useCallback(
    async (session: ChatSession): Promise<string[]> => {
      setIsProcessing(true);
      setProcessingTask('Extracting keywords...');
      setError(null);

      try {
        const content = truncateContent(formatSessionContent(session), 2000);
        const prompt = PROMPTS.embedding.replace('{content}', content);
        const response = await generateText(prompt);

        // Parse keywords
        return response
          .split(/[,\n]/)
          .map((k) => k.trim().toLowerCase())
          .filter((k) => k.length > 2 && k.length < 30)
          .slice(0, 20);
      } catch (e) {
        setError(`Failed to extract keywords: ${e}`);
        throw e;
      } finally {
        setIsProcessing(false);
        setProcessingTask(null);
      }
    },
    [generateText],
  );

  // Process all AI metadata for a session
  const processSession = useCallback(
    async (session: ChatSession): Promise<SessionAIMetadata> => {
      setIsProcessing(true);
      setError(null);

      const metadata: SessionAIMetadata = {
        lastProcessed: new Date().toISOString(),
      };

      try {
        // Generate title + tags in parallel (independent operations)
        setProcessingTask('Generating title & tags...');
        const [smartTitle, tags] = await Promise.all([
          generateSmartTitle(session),
          generateTags(session),
        ]);
        metadata.smartTitle = smartTitle;
        metadata.tags = tags;

        // Generate summary + keywords in parallel
        setProcessingTask('Generating summary & keywords...');
        const [summary, keywords] = await Promise.all([
          generateSummary(session),
          generateKeywords(session),
        ]);
        metadata.summary = summary;
        // Store keyword indices for text-based search (placeholder until real vector embeddings)
        metadata.embedding = keywords.slice(0, 10).map((_, i) => i / 10);

        return metadata;
      } catch (e) {
        setError(`Failed to process session: ${e}`);
        throw e;
      } finally {
        setIsProcessing(false);
        setProcessingTask(null);
      }
    },
    [generateSmartTitle, generateSummary, generateTags, generateKeywords],
  );

  // Semantic search in sessions
  const semanticSearch = useCallback(
    async (
      query: string,
      sessions: ChatSessionSummary[],
      sessionDetails: Map<string, ChatSession>,
    ): Promise<EnhancedSession[]> => {
      setIsProcessing(true);
      setProcessingTask('Searching...');
      setError(null);

      try {
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

        // Score each session based on relevance
        const scored = sessions.map((session) => {
          let score = 0;
          const details = sessionDetails.get(session.id);

          // Title match
          if (session.title.toLowerCase().includes(queryLower)) {
            score += 10;
          }

          // Preview match
          if (session.preview?.toLowerCase().includes(queryLower)) {
            score += 5;
          }

          // Word-level matching
          for (const word of queryWords) {
            if (session.title.toLowerCase().includes(word)) score += 3;
            if (session.preview?.toLowerCase().includes(word)) score += 2;

            // Check message content if available
            if (details) {
              for (const msg of details.messages) {
                if (msg.content.toLowerCase().includes(word)) {
                  score += 1;
                  break;
                }
              }
            }
          }

          // Model match
          if (session.model?.toLowerCase().includes(queryLower)) {
            score += 2;
          }

          return {
            ...session,
            similarity: score,
          } as EnhancedSession;
        });

        // Sort by score and filter out zero scores
        return scored
          .filter((s) => s.similarity && s.similarity > 0)
          .sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
      } catch (e) {
        setError(`Search failed: ${e}`);
        return [];
      } finally {
        setIsProcessing(false);
        setProcessingTask(null);
      }
    },
    [],
  );

  // Find related sessions
  const findRelatedSessions = useCallback(
    async (
      currentSession: ChatSession,
      allSessions: ChatSessionSummary[],
    ): Promise<EnhancedSession[]> => {
      setIsProcessing(true);
      setProcessingTask('Finding related sessions...');
      setError(null);

      try {
        // Extract key terms from current session
        const content = formatSessionContent(currentSession).toLowerCase();
        const words = content
          .split(/\W+/)
          .filter((w) => w.length > 3)
          .slice(0, 100);

        const wordFreq = new Map<string, number>();
        for (const word of words) {
          wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        }

        // Score other sessions
        const scored = allSessions
          .filter((s) => s.id !== currentSession.id)
          .map((session) => {
            let score = 0;
            const sessionText = `${session.title} ${session.preview || ''}`.toLowerCase();

            for (const [word, freq] of wordFreq) {
              if (sessionText.includes(word)) {
                score += freq;
              }
            }

            return {
              ...session,
              similarity: score,
            } as EnhancedSession;
          });

        return scored
          .filter((s) => s.similarity && s.similarity > 0)
          .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
          .slice(0, 5);
      } catch (e) {
        setError(`Failed to find related sessions: ${e}`);
        return [];
      } finally {
        setIsProcessing(false);
        setProcessingTask(null);
      }
    },
    [],
  );

  return {
    // State
    isProcessing,
    processingTask,
    error,

    // Utility
    checkOllama,
    getBestModel,

    // Individual operations
    generateSmartTitle,
    generateSummary,
    generateTags,
    generateKeywords,

    // Batch operations
    processSession,

    // Search & discovery
    semanticSearch,
    findRelatedSessions,

    // Constants
    availableTags: AVAILABLE_TAGS,
  };
}
