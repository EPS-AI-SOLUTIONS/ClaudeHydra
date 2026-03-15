/**
 * WASM Edge Computing dashboard panel.
 *
 * Shows: module status, version, cache info, PII masking benchmark,
 * token counter demo, text similarity, text analysis, and CPU offload metrics.
 */

import type { SimilarityResult, TextStats, WordFreq } from '@jaskier/wasm-worker';
import { clearWasmCache, getWasmCacheInfo } from '@jaskier/wasm-worker';
import { useState } from 'react';
import { useWasmWorker } from '@/shared/hooks/useWasmWorker';

type Tab = 'pii' | 'similarity' | 'analysis';

export function WasmEdgePanel() {
  const {
    isReady,
    version,
    maskPii,
    countTokens,
    benchmark,
    benchmarkSimilarity,
    cosineSimilarity,
    levenshteinSimilarity,
    jaccardSimilarity,
    batchSimilarity,
    analyzeText,
    wordFrequency,
    hashText,
    extractKeywords,
    error,
  } = useWasmWorker();

  const [activeTab, setActiveTab] = useState<Tab>('pii');

  // ── PII tab state ──
  const [testInput, setTestInput] = useState(
    'Email: jan.kowalski@firma.pl, PESEL: 44051401359, Tel: +48 123 456 789, Karta: 4111 1111 1111 1111',
  );
  const [maskResult, setMaskResult] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [benchResult, setBenchResult] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // ── Similarity tab state ──
  const [simTextA, setSimTextA] = useState('how to deploy a Rust application to Fly.io');
  const [simTextB, setSimTextB] = useState('deploying Rust apps on Fly.io platform');
  const [simResult, setSimResult] = useState<{ cosine: number; levenshtein: number; jaccard: number } | null>(null);
  const [batchQuery, setBatchQuery] = useState('deploy rust app');
  const [batchCandidates, setBatchCandidates] = useState(
    'deploy rust application\nconfigure database settings\nrust deployment guide\ncooking recipes\ndeploy node.js app',
  );
  const [batchResults, setBatchResults] = useState<SimilarityResult[] | null>(null);
  const [simBenchResult, setSimBenchResult] = useState<string | null>(null);

  // ── Analysis tab state ──
  const [analysisInput, setAnalysisInput] = useState(
    'The Rust programming language is a systems programming language focused on safety, speed, and concurrency. It achieves memory safety without garbage collection. Rust was originally designed by Graydon Hoare at Mozilla Research.',
  );
  const [textStats, setTextStats] = useState<TextStats | null>(null);
  const [wordFreqs, setWordFreqs] = useState<WordFreq[] | null>(null);
  const [textHash, setTextHash] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[] | null>(null);

  // ── PII handlers ──
  const handleMask = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      const result = await maskPii(testInput);
      setMaskResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setMaskResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCountTokens = async () => {
    if (!isReady) return;
    const count = await countTokens(testInput);
    setTokenCount(count);
  };

  const handleBenchmark = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      const largeInput = testInput.repeat(Math.ceil(50_000 / testInput.length)).slice(0, 50_000);
      const ms = await benchmark(largeInput, 100);
      const perOp = (ms / 100).toFixed(2);
      const charsPerSec = Math.round((50_000 * 100) / (ms / 1000));
      setBenchResult(
        `100 iterations on 50k chars: ${ms.toFixed(0)}ms total, ${perOp}ms/op, ${charsPerSec.toLocaleString()} chars/sec`,
      );
    } catch (err) {
      setBenchResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCacheInfo = async () => {
    const info = await getWasmCacheInfo();
    setCacheInfo(
      info.exists ? `${info.entries} file(s), ${(info.estimatedBytes / 1024).toFixed(1)} KB` : 'No WASM cache found',
    );
  };

  const handleClearCache = async () => {
    await clearWasmCache();
    setCacheInfo('Cache cleared');
  };

  // ── Similarity handlers ──
  const handleCompare = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      const [cosine, levenshtein, jaccard] = await Promise.all([
        cosineSimilarity(simTextA, simTextB),
        levenshteinSimilarity(simTextA, simTextB),
        jaccardSimilarity(simTextA, simTextB),
      ]);
      setSimResult({ cosine, levenshtein, jaccard });
    } finally {
      setIsRunning(false);
    }
  };

  const handleBatchCompare = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      const candidates = batchCandidates.split('\n').filter((c) => c.trim());
      const results = await batchSimilarity(batchQuery, candidates);
      setBatchResults(results);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSimBenchmark = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      const ms = await benchmarkSimilarity(simTextA, simTextB, 1000);
      const perOp = (ms / 1000).toFixed(3);
      setSimBenchResult(`1000 comparisons: ${ms.toFixed(0)}ms total, ${perOp}ms/op`);
    } catch (err) {
      setSimBenchResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  // ── Analysis handlers ──
  const handleAnalyze = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      const [stats, freqs, hash, kw] = await Promise.all([
        analyzeText(analysisInput),
        wordFrequency(analysisInput, 10),
        hashText(analysisInput),
        extractKeywords(analysisInput, 3),
      ]);
      setTextStats(stats);
      setWordFreqs(freqs);
      setTextHash(hash);
      setKeywords(kw);
    } finally {
      setIsRunning(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'pii', label: 'PII Masking' },
    { id: 'similarity', label: 'Similarity' },
    { id: 'analysis', label: 'Analysis' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold">WASM Edge Computing</h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isReady
              ? 'bg-emerald-500/20 text-emerald-400'
              : error
                ? 'bg-red-500/20 text-red-400'
                : 'bg-yellow-500/20 text-yellow-400'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isReady ? 'bg-emerald-400' : error ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'
            }`}
          />
          {isReady ? `v${version}` : error ? 'Error' : 'Loading...'}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-lg bg-neutral-800 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── PII Tab ── */}
      {activeTab === 'pii' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="wasm-test-input" className="text-sm text-neutral-400">
              Test Input (PII data)
            </label>
            <textarea
              id="wasm-test-input"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-sm text-neutral-200 font-mono resize-y min-h-[80px]"
              rows={3}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleMask}
              disabled={!isReady || isRunning}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Mask PII
            </button>
            <button
              type="button"
              onClick={handleCountTokens}
              disabled={!isReady}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Count Tokens
            </button>
            <button
              type="button"
              onClick={handleBenchmark}
              disabled={!isReady || isRunning}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Benchmark (50k chars)
            </button>
            <button
              type="button"
              onClick={handleCacheInfo}
              className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600 transition-colors"
            >
              Cache Info
            </button>
            <button
              type="button"
              onClick={handleClearCache}
              className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600 transition-colors"
            >
              Clear Cache
            </button>
          </div>

          {tokenCount !== null && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
              <span className="text-sm text-blue-300">
                Estimated tokens: <span className="font-mono font-bold">{tokenCount}</span>
              </span>
            </div>
          )}

          {benchResult && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <span className="text-sm text-amber-300 font-mono">{benchResult}</span>
            </div>
          )}

          {cacheInfo && (
            <div className="rounded-lg border border-neutral-600 bg-neutral-800 p-3">
              <span className="text-sm text-neutral-300">
                WASM Cache: <span className="font-mono">{cacheInfo}</span>
              </span>
            </div>
          )}

          {maskResult && (
            <div className="space-y-1">
              <label htmlFor="wasm-mask-result" className="text-sm text-neutral-400">
                PII Masking Result
              </label>
              <pre
                id="wasm-mask-result"
                className="rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-xs text-neutral-200 overflow-auto max-h-[300px] font-mono"
              >
                {maskResult}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── Similarity Tab ── */}
      {activeTab === 'similarity' && (
        <div className="space-y-4">
          {/* Pair Comparison */}
          <div className="space-y-2">
            <label htmlFor="sim-text-a" className="text-sm text-neutral-400">
              Text A
            </label>
            <input
              id="sim-text-a"
              value={simTextA}
              onChange={(e) => setSimTextA(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5 text-sm text-neutral-200 font-mono"
            />
            <label htmlFor="sim-text-b" className="text-sm text-neutral-400">
              Text B
            </label>
            <input
              id="sim-text-b"
              value={simTextB}
              onChange={(e) => setSimTextB(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5 text-sm text-neutral-200 font-mono"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCompare}
              disabled={!isReady || isRunning}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Compare
            </button>
            <button
              type="button"
              onClick={handleSimBenchmark}
              disabled={!isReady || isRunning}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Benchmark (1k ops)
            </button>
          </div>

          {simResult && (
            <div className="grid grid-cols-3 gap-3">
              <ScoreCard label="Cosine (trigram)" value={simResult.cosine} color="teal" />
              <ScoreCard label="Levenshtein" value={simResult.levenshtein} color="blue" />
              <ScoreCard label="Jaccard (words)" value={simResult.jaccard} color="purple" />
            </div>
          )}

          {simBenchResult && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <span className="text-sm text-amber-300 font-mono">{simBenchResult}</span>
            </div>
          )}

          {/* Batch Comparison */}
          <div className="border-t border-neutral-700 pt-4 space-y-2">
            <h4 className="text-sm font-medium text-neutral-300">Batch Similarity (semantic cache preview)</h4>
            <label htmlFor="batch-query" className="text-sm text-neutral-400">
              Query
            </label>
            <input
              id="batch-query"
              value={batchQuery}
              onChange={(e) => setBatchQuery(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5 text-sm text-neutral-200 font-mono"
            />
            <label htmlFor="batch-candidates" className="text-sm text-neutral-400">
              Candidates (one per line)
            </label>
            <textarea
              id="batch-candidates"
              value={batchCandidates}
              onChange={(e) => setBatchCandidates(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5 text-sm text-neutral-200 font-mono resize-y min-h-[80px]"
              rows={4}
            />
            <button
              type="button"
              onClick={handleBatchCompare}
              disabled={!isReady || isRunning}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Rank Candidates
            </button>

            {batchResults && (
              <div className="space-y-1.5">
                {batchResults.map((r) => {
                  const candidateLines = batchCandidates.split('\n').filter((c) => c.trim());
                  return (
                    <div
                      key={r.index}
                      className="flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 p-2.5"
                    >
                      <div className="flex-1 text-sm text-neutral-200 font-mono truncate">
                        {candidateLines[r.index]}
                      </div>
                      <div className="flex gap-2 text-xs font-mono shrink-0">
                        <span className="text-teal-400">{(r.combined * 100).toFixed(1)}%</span>
                        <span className="text-neutral-500">
                          cos:{(r.cosine * 100).toFixed(0)} jac:{(r.jaccard * 100).toFixed(0)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Analysis Tab ── */}
      {activeTab === 'analysis' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="analysis-input" className="text-sm text-neutral-400">
              Input Text
            </label>
            <textarea
              id="analysis-input"
              value={analysisInput}
              onChange={(e) => setAnalysisInput(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-sm text-neutral-200 font-mono resize-y min-h-[100px]"
              rows={4}
            />
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!isReady || isRunning}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Analyze Text
          </button>

          {textStats && (
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Words" value={textStats.words} />
              <StatCard label="Sentences" value={textStats.sentences} />
              <StatCard label="Unique words" value={textStats.unique_words} />
              <StatCard label="Characters" value={textStats.chars} />
              <StatCard label="Avg word length" value={textStats.avg_word_length.toFixed(1)} />
              <StatCard
                label="Reading time"
                value={
                  textStats.estimated_reading_time_secs < 60
                    ? `${textStats.estimated_reading_time_secs}s`
                    : `${Math.ceil(textStats.estimated_reading_time_secs / 60)}m`
                }
              />
            </div>
          )}

          {textHash && (
            <div className="rounded-lg border border-neutral-600 bg-neutral-800 p-2.5">
              <span className="text-xs text-neutral-400">FNV-1a hash: </span>
              <span className="text-xs text-neutral-200 font-mono">{textHash}</span>
            </div>
          )}

          {keywords && keywords.length > 0 && (
            <div className="space-y-1">
              <span className="text-sm text-neutral-400">Keywords</span>
              <div className="flex flex-wrap gap-1.5">
                {keywords.slice(0, 15).map((kw) => (
                  <span key={kw} className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs text-indigo-300">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {wordFreqs && wordFreqs.length > 0 && (
            <div className="space-y-1">
              <span className="text-sm text-neutral-400">Word Frequency (top 10)</span>
              <div className="space-y-1">
                {wordFreqs.map((wf) => (
                  <div key={wf.word} className="flex items-center gap-2">
                    <span className="text-xs text-neutral-200 font-mono w-24 truncate">{wf.word}</span>
                    <div className="flex-1 h-3 rounded-full bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500/50"
                        style={{ width: `${Math.min(wf.percentage * 3, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-neutral-500 font-mono w-16 text-right">
                      {wf.count} ({wf.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Architecture Info */}
      <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 space-y-1">
        <p className="text-xs text-neutral-500">
          PII masking, token counting, text similarity, and text analysis run in a dedicated Web Worker via WebAssembly.
          The main UI thread is never blocked — maintaining 60 FPS during processing.
        </p>
        <p className="text-xs text-neutral-500">
          WASM binaries are cached via Service Worker Cache API for instant 0ms loading on revisits. SIMD acceleration
          available via feature flag.
        </p>
      </div>
    </div>
  );
}

// ── Helper Components ──

function ScoreCard({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = (value * 100).toFixed(1);
  const colorClasses: Record<string, string> = {
    teal: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  };

  return (
    <div className={`rounded-lg border p-3 text-center ${colorClasses[color] || colorClasses.teal}`}>
      <div className="text-xl font-bold font-mono">{pct}%</div>
      <div className="text-xs opacity-75 mt-0.5">{label}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 text-center">
      <div className="text-lg font-bold font-mono text-neutral-200">{value}</div>
      <div className="text-xs text-neutral-500 mt-0.5">{label}</div>
    </div>
  );
}
