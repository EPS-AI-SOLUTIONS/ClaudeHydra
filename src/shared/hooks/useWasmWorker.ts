/**
 * React hook for WebAssembly Edge Computing via Web Worker.
 *
 * Provides a singleton WasmClient instance shared across the app,
 * with automatic lifecycle management and ready-state tracking.
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const { maskPii, countTokens, cosineSimilarity, analyzeText, isReady } = useWasmWorker();
 *
 *   const handleMask = async (text: string) => {
 *     const result = await maskPii(text);
 *     console.log(result.masked);
 *   };
 *
 *   const handleSimilarity = async () => {
 *     const score = await cosineSimilarity("query A", "query B");
 *     console.log(`Similarity: ${(score * 100).toFixed(1)}%`);
 *   };
 * }
 * ```
 */

import type { FuzzyMatch, PiiResult, SimilarityResult, TextStats, WordFreq } from '@jaskier/wasm-worker';
import { WasmClient } from '@jaskier/wasm-worker';
import { useCallback, useEffect, useRef, useState } from 'react';

// Singleton client — shared across all hook consumers
let globalClient: WasmClient | null = null;
let clientRefCount = 0;

function getOrCreateClient(): WasmClient {
  if (!globalClient) {
    globalClient = new WasmClient();
  }
  clientRefCount++;
  return globalClient;
}

function releaseClient(): void {
  clientRefCount--;
  if (clientRefCount <= 0 && globalClient) {
    globalClient.dispose();
    globalClient = null;
    clientRefCount = 0;
  }
}

interface UseWasmWorkerResult {
  /** Whether the WASM module is loaded and ready */
  isReady: boolean;
  /** WASM module version */
  version: string;
  /** Initialization error, if any */
  error: string | null;

  // ── PII Masking ──
  /** Mask all PII in text */
  maskPii: (input: string) => Promise<PiiResult>;
  /** Mask only emails */
  maskEmails: (input: string) => Promise<string>;
  /** Mask only card numbers */
  maskCards: (input: string) => Promise<string>;
  /** Mask only PESEL numbers */
  maskPesel: (input: string) => Promise<string>;
  /** Mask only phone numbers */
  maskPhones: (input: string) => Promise<string>;
  /** Mask only NIP numbers */
  maskNip: (input: string) => Promise<string>;
  /** Mask only IBAN numbers */
  maskIban: (input: string) => Promise<string>;

  // ── Token Counting ──
  /** Estimate token count */
  countTokens: (input: string) => Promise<number>;
  /** Estimate token counts for multiple texts */
  countTokensBatch: (inputs: string[]) => Promise<number[]>;

  // ── Text Similarity ──
  /** Cosine similarity between two texts (trigram-based). Returns [0.0, 1.0]. */
  cosineSimilarity: (a: string, b: string) => Promise<number>;
  /** Cosine similarity with configurable n-gram size */
  cosineSimilarityNgram: (a: string, b: string, n: number) => Promise<number>;
  /** Levenshtein edit distance between two strings */
  levenshteinDistance: (a: string, b: string) => Promise<number>;
  /** Normalized Levenshtein similarity [0.0, 1.0] */
  levenshteinSimilarity: (a: string, b: string) => Promise<number>;
  /** Jaccard similarity between word sets [0.0, 1.0] */
  jaccardSimilarity: (a: string, b: string) => Promise<number>;
  /** Fuzzy search a query against candidates */
  fuzzySearch: (query: string, candidates: string[], minScore?: number) => Promise<FuzzyMatch[]>;
  /** Compare a query against multiple candidates with detailed scores */
  batchSimilarity: (query: string, candidates: string[]) => Promise<SimilarityResult[]>;

  // ── Text Analysis ──
  /** Compute comprehensive text statistics */
  analyzeText: (input: string) => Promise<TextStats>;
  /** Get top N most frequent words */
  wordFrequency: (input: string, topN?: number) => Promise<WordFreq[]>;
  /** Fast FNV-1a hash of text (16-char hex) */
  hashText: (input: string) => Promise<string>;
  /** Truncate text at word boundary with ellipsis */
  smartTruncate: (input: string, maxChars: number) => Promise<string>;
  /** Extract keywords, filtering stop words (EN+PL) */
  extractKeywords: (input: string, minWordLength?: number) => Promise<string[]>;

  // ── Benchmarks ──
  /** Run PII masking benchmark */
  benchmark: (input: string, iterations: number) => Promise<number>;
  /** Run similarity benchmark */
  benchmarkSimilarity: (a: string, b: string, iterations: number) => Promise<number>;
}

export function useWasmWorker(): UseWasmWorkerResult {
  const [isReady, setIsReady] = useState(false);
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<WasmClient | null>(null);

  useEffect(() => {
    const client = getOrCreateClient();
    clientRef.current = client;

    // If already ready (from another consumer), sync state
    if (client.initialized) {
      setIsReady(true);
      setVersion(client.wasmVersion);
    } else {
      client
        .ready()
        .then((v) => {
          setIsReady(true);
          setVersion(v);
        })
        .catch((err) => {
          setError(err.message);
        });
    }

    return () => {
      clientRef.current = null;
      releaseClient();
    };
  }, []);

  const getClient = useCallback((): WasmClient => {
    const c = clientRef.current;
    if (!c) throw new Error('WasmClient not available');
    return c;
  }, []);

  // ── PII ──
  const maskPii = useCallback((input: string) => getClient().maskPii(input), [getClient]);
  const maskEmails = useCallback((input: string) => getClient().maskEmails(input), [getClient]);
  const maskCards = useCallback((input: string) => getClient().maskCards(input), [getClient]);
  const maskPesel = useCallback((input: string) => getClient().maskPesel(input), [getClient]);
  const maskPhones = useCallback((input: string) => getClient().maskPhones(input), [getClient]);
  const maskNip = useCallback((input: string) => getClient().maskNip(input), [getClient]);
  const maskIban = useCallback((input: string) => getClient().maskIban(input), [getClient]);

  // ── Tokens ──
  const countTokens = useCallback((input: string) => getClient().countTokens(input), [getClient]);
  const countTokensBatch = useCallback((inputs: string[]) => getClient().countTokensBatch(inputs), [getClient]);

  // ── Similarity ──
  const cosineSimilarity = useCallback((a: string, b: string) => getClient().cosineSimilarity(a, b), [getClient]);
  const cosineSimilarityNgram = useCallback(
    (a: string, b: string, n: number) => getClient().cosineSimilarityNgram(a, b, n),
    [getClient],
  );
  const levenshteinDistance = useCallback((a: string, b: string) => getClient().levenshteinDistance(a, b), [getClient]);
  const levenshteinSimilarity = useCallback(
    (a: string, b: string) => getClient().levenshteinSimilarity(a, b),
    [getClient],
  );
  const jaccardSimilarity = useCallback((a: string, b: string) => getClient().jaccardSimilarity(a, b), [getClient]);
  const fuzzySearch = useCallback(
    (query: string, candidates: string[], minScore = 0.3) => getClient().fuzzySearch(query, candidates, minScore),
    [getClient],
  );
  const batchSimilarity = useCallback(
    (query: string, candidates: string[]) => getClient().batchSimilarity(query, candidates),
    [getClient],
  );

  // ── Text Analysis ──
  const analyzeText = useCallback((input: string) => getClient().analyzeText(input), [getClient]);
  const wordFrequency = useCallback((input: string, topN = 10) => getClient().wordFrequency(input, topN), [getClient]);
  const hashText = useCallback((input: string) => getClient().hashText(input), [getClient]);
  const smartTruncate = useCallback(
    (input: string, maxChars: number) => getClient().smartTruncate(input, maxChars),
    [getClient],
  );
  const extractKeywords = useCallback(
    (input: string, minWordLength = 3) => getClient().extractKeywords(input, minWordLength),
    [getClient],
  );

  // ── Benchmarks ──
  const benchmark = useCallback(
    (input: string, iterations: number) => getClient().benchmark(input, iterations),
    [getClient],
  );
  const benchmarkSimilarity = useCallback(
    (a: string, b: string, iterations: number) => getClient().benchmarkSimilarity(a, b, iterations),
    [getClient],
  );

  return {
    isReady,
    version,
    error,
    // PII
    maskPii,
    maskEmails,
    maskCards,
    maskPesel,
    maskPhones,
    maskNip,
    maskIban,
    // Tokens
    countTokens,
    countTokensBatch,
    // Similarity
    cosineSimilarity,
    cosineSimilarityNgram,
    levenshteinDistance,
    levenshteinSimilarity,
    jaccardSimilarity,
    fuzzySearch,
    batchSimilarity,
    // Text Analysis
    analyzeText,
    wordFrequency,
    hashText,
    smartTruncate,
    extractKeywords,
    // Benchmarks
    benchmark,
    benchmarkSimilarity,
  };
}
