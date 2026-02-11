import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

// Research result structure
export interface ResearchResult {
  source: 'google' | 'stackoverflow' | 'combined';
  query: string;
  title: string;
  snippet: string;
  url: string;
  timestamp: string;
  relevanceScore?: number;
}

// Dijkstra knowledge transfer structure
export interface DijkstraKnowledge {
  topic: string;
  summary: string;
  sources: ResearchResult[];
  recommendations: string[];
  timestamp: string;
}

// StackOverflow API response types
interface SOQuestion {
  question_id: number;
  title: string;
  link: string;
  score: number;
  answer_count: number;
  is_answered: boolean;
  body_markdown?: string;
  tags: string[];
}

interface SOSearchResponse {
  items: SOQuestion[];
  has_more: boolean;
  quota_remaining: number;
}

// Agent memory entry
interface MemoryEntry {
  agent: string;
  entry_type: 'fact' | 'error' | 'decision' | 'context';
  content: string;
  tags: string[];
}

/**
 * Avallac'h - The Knowledge Seeker
 * Research agent that queries Google and StackOverflow,
 * synthesizes information, and passes it to Dijkstra for strategic analysis.
 */
export function useResearchAgent() {
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastKnowledge, setLastKnowledge] = useState<DijkstraKnowledge | null>(null);

  /**
   * Search StackOverflow API (free, no key required)
   */
  const searchStackOverflow = useCallback(async (query: string): Promise<ResearchResult[]> => {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodedQuery}&site=stackoverflow&filter=withbody&pagesize=5`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`SO API error: ${response.status}`);

      const data: SOSearchResponse = await response.json();

      return data.items.map((item) => ({
        source: 'stackoverflow' as const,
        query,
        title: item.title,
        snippet:
          item.body_markdown?.slice(0, 300) ||
          `Score: ${item.score}, Answers: ${item.answer_count}`,
        url: item.link,
        timestamp: new Date().toISOString(),
        relevanceScore: item.score,
      }));
    } catch (err) {
      console.error('StackOverflow search failed:', err);
      return [];
    }
  }, []);

  /**
   * Search via proxy/CORS-friendly service
   * Falls back to DuckDuckGo HTML API if needed
   */
  const searchGoogle = useCallback(async (query: string): Promise<ResearchResult[]> => {
    // Try using Tauri's fetch capability (bypasses CORS)
    try {
      // Use DuckDuckGo Instant Answer API as Google alternative (CORS-friendly)
      const encodedQuery = encodeURIComponent(query);
      const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Search API error: ${response.status}`);

      const data = await response.json();

      const results: ResearchResult[] = [];

      // Abstract (main answer)
      if (data.Abstract) {
        results.push({
          source: 'google',
          query,
          title: data.Heading || query,
          snippet: data.Abstract,
          url: data.AbstractURL || `https://duckduckgo.com/?q=${encodedQuery}`,
          timestamp: new Date().toISOString(),
          relevanceScore: 100,
        });
      }

      // Related topics
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        data.RelatedTopics.slice(0, 4).forEach(
          (topic: { Text?: string; FirstURL?: string; Name?: string }) => {
            if (topic.Text) {
              results.push({
                source: 'google',
                query,
                title: topic.Name || 'Related',
                snippet: topic.Text.slice(0, 300),
                url: topic.FirstURL || '#',
                timestamp: new Date().toISOString(),
                relevanceScore: 50,
              });
            }
          },
        );
      }

      return results;
    } catch (err) {
      console.error('Web search failed:', err);
      return [];
    }
  }, []);

  /**
   * Save memory to agent (Avallac'h or Dijkstra)
   */
  const saveAgentMemory = useCallback(async (entry: MemoryEntry): Promise<boolean> => {
    try {
      await invoke('add_agent_memory', {
        agent: entry.agent,
        entryType: entry.entry_type,
        content: entry.content,
        tags: entry.tags.join(','),
      });
      return true;
    } catch (err) {
      console.error('Failed to save memory:', err);
      return false;
    }
  }, []);

  /**
   * Synthesize research results using local LLM (Ollama)
   */
  const synthesizeWithAI = useCallback(
    async (
      topic: string,
      results: ResearchResult[],
    ): Promise<{ summary: string; recommendations: string[] }> => {
      const context = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}`).join('\n\n');

      const prompt = `You are Avallac'h, an elven sage gathering knowledge.

Topic: ${topic}

Research findings:
${context}

Provide:
1. A concise summary (2-3 sentences) of the current state of knowledge on this topic
2. 3-5 actionable recommendations or key insights

Format your response as:
SUMMARY: <your summary>
RECOMMENDATIONS:
- <recommendation 1>
- <recommendation 2>
- <recommendation 3>`;

      try {
        // Try Ollama first
        const response = await invoke<string>('ollama_generate_sync', {
          model: 'llama3.2:3b',
          prompt,
          options: { temperature: 0.3 },
        });

        // Parse response
        const summaryMatch = response.match(/SUMMARY:\s*(.+?)(?=RECOMMENDATIONS:|$)/s);
        const recsMatch = response.match(/RECOMMENDATIONS:\s*([\s\S]+)/);

        const summary = summaryMatch?.[1]?.trim() || 'No summary generated';
        const recommendations =
          recsMatch?.[1]
            ?.split('\n')
            .filter((line) => line.trim().startsWith('-'))
            .map((line) => line.replace(/^-\s*/, '').trim())
            .filter(Boolean) || [];

        return { summary, recommendations };
      } catch {
        // Fallback: simple concatenation
        return {
          summary: `Found ${results.length} sources on "${topic}". Top result: ${results[0]?.title || 'N/A'}`,
          recommendations: results.slice(0, 3).map((r) => `Review: ${r.title}`),
        };
      }
    },
    [],
  );

  /**
   * Transfer knowledge to Dijkstra (Strategist)
   */
  const transferToDijkstra = useCallback(
    async (knowledge: DijkstraKnowledge): Promise<boolean> => {
      // Format for Dijkstra's strategic analysis
      const strategicBrief = `
[KNOWLEDGE TRANSFER FROM AVALLAC'H]
Topic: ${knowledge.topic}
Timestamp: ${knowledge.timestamp}

Summary: ${knowledge.summary}

Key Recommendations:
${knowledge.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Sources: ${knowledge.sources.length} verified
Top Source: ${knowledge.sources[0]?.title || 'N/A'} (${knowledge.sources[0]?.source || 'unknown'})
`.trim();

      // Save to Dijkstra's memory
      const saved = await saveAgentMemory({
        agent: 'Dijkstra',
        entry_type: 'context',
        content: strategicBrief,
        tags: ['research', 'avallach', knowledge.topic.split(' ')[0].toLowerCase()],
      });

      // Also save to Avallac'h's memory
      await saveAgentMemory({
        agent: 'Avallach',
        entry_type: 'fact',
        content: `Researched "${knowledge.topic}" - transferred ${knowledge.sources.length} sources to Dijkstra`,
        tags: ['research', 'completed', knowledge.topic.split(' ')[0].toLowerCase()],
      });

      return saved;
    },
    [saveAgentMemory],
  );

  /**
   * Main research function - orchestrates the full flow
   */
  const research = useCallback(
    async (topic: string): Promise<DijkstraKnowledge | null> => {
      setIsSearching(true);
      setError(null);
      setResults([]);

      try {
        // Step 1: Parallel search on Google (DuckDuckGo) and StackOverflow
        const [googleResults, soResults] = await Promise.all([
          searchGoogle(topic),
          searchStackOverflow(topic),
        ]);

        // Combine and sort by relevance
        const combined = [...googleResults, ...soResults].sort(
          (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0),
        );

        setResults(combined);

        if (combined.length === 0) {
          setError('No results found. Try a different query.');
          return null;
        }

        // Step 2: Synthesize with AI
        const { summary, recommendations } = await synthesizeWithAI(topic, combined);

        // Step 3: Create knowledge package
        const knowledge: DijkstraKnowledge = {
          topic,
          summary,
          sources: combined,
          recommendations,
          timestamp: new Date().toISOString(),
        };

        setLastKnowledge(knowledge);

        // Step 4: Transfer to Dijkstra
        const transferred = await transferToDijkstra(knowledge);
        if (!transferred) {
          console.warn('Failed to transfer knowledge to Dijkstra');
        }

        return knowledge;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Research failed';
        setError(message);
        return null;
      } finally {
        setIsSearching(false);
      }
    },
    [searchGoogle, searchStackOverflow, synthesizeWithAI, transferToDijkstra],
  );

  /**
   * Quick search without AI synthesis (faster)
   */
  const quickSearch = useCallback(
    async (query: string): Promise<ResearchResult[]> => {
      setIsSearching(true);
      setError(null);

      try {
        const [googleResults, soResults] = await Promise.all([
          searchGoogle(query),
          searchStackOverflow(query),
        ]);

        const combined = [...googleResults, ...soResults];
        setResults(combined);
        return combined;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Search failed';
        setError(message);
        return [];
      } finally {
        setIsSearching(false);
      }
    },
    [searchGoogle, searchStackOverflow],
  );

  return {
    // State
    isSearching,
    results,
    error,
    lastKnowledge,

    // Actions
    research, // Full research with AI synthesis + Dijkstra transfer
    quickSearch, // Fast search without synthesis
    searchStackOverflow,
    searchGoogle,
    transferToDijkstra,

    // Utils
    clearResults: () => setResults([]),
    clearError: () => setError(null),
  };
}

export default useResearchAgent;
