import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS FROM 10 LEARNING BLOCKS (simplified for type safety)
// ═══════════════════════════════════════════════════════════════════════════

// Block 1: RAG Engine - (embeddings used via Tauri invoke)

// Block 9: Analytics
import {
  classifyQuery,
  extractKeywords as extractAnalyticsKeywords,
  useAnalyticsStore,
} from '../lib/analytics';
// Block 6: Context Cache
import { compressContext, getRelevantHistory, researchCache } from '../lib/contextCache';
// Block 3: Data Quality
import { detectLanguage, filterContent, isDuplicate, scoreQuality } from '../lib/dataQuality';
// Block 7: Feedback System
import {
  calculateSessionScore,
  isFollowUp,
  trackCodeCopy,
  useFeedbackStore,
} from '../lib/feedbackSystem';
// Block 10: Memory Manager
import {
  addMemoryToProfile,
  getProjectProfile,
  pruneProjectMemories,
  updateProjectPreferences,
} from '../lib/memoryManager';
// Block 5: Model Registry
import { selectModelForQuery, useModelRegistry } from '../lib/modelRegistry';

// Block 8: Performance
import { AsyncQueue, hashQuery, QueryCache } from '../lib/performance';
// Block 2: RAG Retrieval
import { type ExpandedQuery, expandQuery } from '../lib/ragRetrieval';
// Block 4: Training Pipeline
import {
  augmentSample,
  createPreferencePair,
  sortByCurriculum,
  stratifiedSplit,
} from '../lib/trainingPipeline';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WOLF PACK AI PIPELINE - INTEGRATED CONTINUOUS LEARNING SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pipeline Stages:
 * 1. 🧙 Avallac'h (Pre) - RAG search, query expansion, context enrichment
 * 2. 🤖 Ollama (AI) - Model selection, A/B testing, generation
 * 3. 🔮 Vilgefortz (Post) - Quality scoring, analytics, feedback
 * 4. ⚗️ Alzur (Training) - RAG save, dedup, training pipeline
 */

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface PipelineContext {
  originalPrompt: string;
  enrichedPrompt: string;
  researchContext: string[];
  response: string;
  learnings: string[];
  timestamp: number;
  expandedQuery?: ExpandedQuery;
  qualityScore?: number;
  modelUsed?: string;
  timings?: {
    preProcess: number;
    aiGeneration: number;
    postProcess: number;
    training: number;
    total: number;
  };
}

interface AgentMemoryEntry {
  agent: string;
  entryType: 'fact' | 'error' | 'decision' | 'context';
  content: string;
  tags: string;
}

interface SOQuestion {
  title: string;
  link: string;
  score: number;
  is_answered: boolean;
}

interface SimpleSample {
  id: string;
  prompt: string;
  completion: string;
  quality: number;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// State (module-level)
// WARNING: These module-level variables are shared across all component
// instances. This is intentional — the pipeline is a singleton.
// If multiple pipeline instances are ever needed, refactor to useRef + context.
// ═══════════════════════════════════════════════════════════════════════════

// Async queue for non-blocking RAG writes (Block 8)
const ragWriteQueue = new AsyncQueue<void>(3);

// Query result cache (Block 8)
const queryCache = new QueryCache<string[]>({ ttlMs: 5 * 60 * 1000, maxSize: 500 });

// Training state
let trainingSampleCount = 0;
let trainingBuffer: SimpleSample[] = [];
let isTraining = false;
let currentModelVersion = 0;
let lastSampleContent = '';
let sessionId = `session-${Date.now()}`;

const MICRO_BATCH_SIZE = 10;
const BASE_MODEL = 'llama3.2:1b';

// Working directory for per-project profiles (Block 10)
let workingDirectory = '.';

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 1: AVALLAC'H - Pre-Processing
// ═══════════════════════════════════════════════════════════════════════════

async function avallachPreProcess(prompt: string): Promise<{
  enrichedPrompt: string;
  context: string[];
  expandedQuery: ExpandedQuery;
  timingMs: number;
}> {
  const startTime = performance.now();
  const context: string[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Query Expansion (Block 2)
  // ─────────────────────────────────────────────────────────────────────────
  const expanded = expandQuery(prompt);
  console.log(`🧙 [AVALLAC'H] Query expanded with synonyms`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Check Query Cache (Block 8)
  // ─────────────────────────────────────────────────────────────────────────
  const cacheKey = hashQuery(prompt);
  const cachedContext = queryCache.get(cacheKey);

  if (cachedContext) {
    console.log(`🧙 [AVALLAC'H] Cache hit!`);
    context.push(...cachedContext);
  } else {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Backend RAG Search
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const ragResults = await invoke<Array<{ id: string; content: string; score?: number }>>(
        'learning_rag_search',
        {
          query: prompt,
          topK: 5,
        },
      );

      if (ragResults.length > 0) {
        context.push(`[📚 Alzur Memory - ${ragResults.length} samples]`);
        ragResults.forEach((r, i) => {
          const answer = r.content.split('\n\nA: ')[1] || r.content;
          context.push(
            `  ${i + 1}. ${answer.slice(0, 150)}... (${((r.score || 0) * 100).toFixed(0)}%)`,
          );
        });
        console.log(`🧙 [AVALLAC'H] Found ${ragResults.length} RAG results`);
      }
    } catch {
      // RAG not available
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Project Profile History (Block 10)
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const profile = getProjectProfile(workingDirectory);
      if (profile.memories.length > 0) {
        // Convert memories to ConversationMessage format
        const historyMessages = profile.memories.slice(0, 5).map((m) => ({
          id: m.id,
          role: 'user' as const,
          content: m.content,
          timestamp: m.updatedAt || Date.now(),
        }));

        const relevantHistory = getRelevantHistory(historyMessages, prompt, {
          maxResults: 2,
          minSimilarity: 0.3,
        });

        if (relevantHistory.length > 0) {
          context.push(`[🔄 Recent Context]`);
          relevantHistory.forEach((h, i) => {
            context.push(`  ${i + 1}. ${h.content.slice(0, 100)}...`);
          });
        }
      }
    } catch {
      // Profile not available
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Web Search
    // ─────────────────────────────────────────────────────────────────────────
    const searchQuery = extractKeywords(prompt).slice(0, 3).join(' ');
    if (searchQuery.length > 3) {
      // Check research cache (Block 6)
      const cachedResearch = researchCache.get(searchQuery) as string[] | null;
      if (cachedResearch) {
        context.push(`[🔍 Cached Research]`);
        cachedResearch.slice(0, 2).forEach((r, i) => {
          context.push(`  ${i + 1}. ${r}`);
        });
      } else {
        const [soResults, webResults] = await Promise.all([
          searchStackOverflow(searchQuery),
          searchWeb(searchQuery),
        ]);

        if (soResults.length > 0) {
          context.push(`[🔍 StackOverflow] "${searchQuery}":`);
          soResults.slice(0, 2).forEach((r, i) => {
            context.push(`  ${i + 1}. ${r.title} (score: ${r.score})`);
          });
        }

        if (webResults.length > 0) {
          context.push(`[🌐 Web]`);
          webResults.slice(0, 2).forEach((r, i) => {
            context.push(`  ${i + 1}. ${r}`);
          });
          researchCache.set(searchQuery, webResults);
        }
      }
    }

    // Cache the context
    if (context.length > 0) {
      queryCache.set(cacheKey, context);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: Context Compression (Block 6)
  // ─────────────────────────────────────────────────────────────────────────
  let finalContext = context.join('\n');
  if (finalContext.length > 2000) {
    finalContext = compressContext(finalContext, 1500);
    console.log(`🧙 [AVALLAC'H] Context compressed`);
  }

  const enrichedPrompt =
    finalContext.length > 0
      ? `[Knowledge Context]\n${finalContext}\n\n[User Query]\n${prompt}`
      : prompt;

  if (context.length > 0) {
    await saveAgentMemory({
      agent: 'Avallach',
      entryType: 'context',
      content: `Research for: "${prompt.slice(0, 50)}..." - ${context.length} sources`,
      tags: 'research,auto,pre-process',
    });
  }

  return {
    enrichedPrompt,
    context,
    expandedQuery: expanded,
    timingMs: performance.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 2: MODEL SELECTION (Block 5)
// ═══════════════════════════════════════════════════════════════════════════

function selectModel(prompt: string): { model: string; isAbTest: boolean } {
  // Use model registry for auto-selection
  const selected = selectModelForQuery(prompt);

  if (typeof selected === 'string') {
    return { model: selected, isAbTest: false };
  }

  // If ModelInfo returned, use its name
  if (selected && typeof selected === 'object' && 'name' in selected) {
    return { model: (selected as { name: string }).name, isAbTest: false };
  }

  return { model: BASE_MODEL, isAbTest: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 3: VILGEFORTZ - Post-Processing
// ═══════════════════════════════════════════════════════════════════════════

async function vilgefortzPostProcess(ctx: PipelineContext): Promise<string[]> {
  const learnings: string[] = [];
  const analytics = useAnalyticsStore.getState();

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Quality Scoring (Block 3)
    // ─────────────────────────────────────────────────────────────────────────
    const qualityResult = scoreQuality(ctx.response, ctx.originalPrompt);
    ctx.qualityScore = qualityResult.total;
    console.log(`🔮 [VILGEFORTZ] Quality: ${qualityResult.total}/100`);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Content Filtering (Block 3)
    // ─────────────────────────────────────────────────────────────────────────
    const filterResult = filterContent(ctx.response);
    if (filterResult.severity !== 'none') {
      learnings.push(`⚠️ Content warning: ${filterResult.severity}`);
      console.log(`🔮 [VILGEFORTZ] Content filter: ${filterResult.severity}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Language Detection (Block 3)
    // ─────────────────────────────────────────────────────────────────────────
    const langResult = detectLanguage(ctx.response);
    if (langResult.confidence > 70) {
      learnings.push(`Language: ${langResult.primary} (${langResult.confidence}%)`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Analytics Tracking (Block 9)
    // ─────────────────────────────────────────────────────────────────────────
    const queryType = classifyQuery(ctx.originalPrompt);
    const keywords = extractAnalyticsKeywords(ctx.originalPrompt);

    analytics.trackQuery(queryType, keywords);
    analytics.incrementSamples();
    analytics.updateAvgQuality(qualityResult.total);

    // Track tokens
    const promptTokens = Math.ceil(ctx.enrichedPrompt.length / 4);
    const completionTokens = Math.ceil(ctx.response.length / 4);
    analytics.trackTokens(promptTokens, completionTokens);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Follow-up Detection (Block 7)
    // ─────────────────────────────────────────────────────────────────────────
    if (isFollowUp(ctx.originalPrompt)) {
      learnings.push('📌 Follow-up question detected');
      useFeedbackStore.getState().markFollowUp(`msg-${ctx.timestamp}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Code Detection (Block 7)
    // ─────────────────────────────────────────────────────────────────────────
    const codeBlocks = ctx.response.match(/```[\s\S]*?```/g);
    if (codeBlocks && codeBlocks.length > 0) {
      codeBlocks.forEach((block, i) => {
        const lang = block.match(/```(\w+)/)?.[1] || 'unknown';
        trackCodeCopy(`msg-${ctx.timestamp}-${i}`, block, lang);
      });
      learnings.push(`💻 ${codeBlocks.length} code block(s)`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 7: Extract Insights
    // ─────────────────────────────────────────────────────────────────────────
    const insights = extractInsights(ctx.response);
    learnings.push(...insights);

    // Save analysis
    await saveAgentMemory({
      agent: 'Vilgefortz',
      entryType: 'fact',
      content: `[Analysis] Quality: ${qualityResult.total}/100, Type: ${queryType}`,
      tags: 'analysis,quality,post-process',
    });

    // Record timing (Block 9)
    analytics.recordTiming({
      embeddingMs: 0,
      retrievalMs: ctx.timings?.preProcess || 0,
      generationMs: ctx.timings?.aiGeneration || 0,
      totalMs: ctx.timings?.total || 0,
    });

    return learnings;
  } catch (err) {
    console.warn('Vilgefortz post-process failed:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 4: ALZUR - Training & RAG Storage
// ═══════════════════════════════════════════════════════════════════════════

async function alzurTrainingCheck(ctx: PipelineContext): Promise<void> {
  const analytics = useAnalyticsStore.getState();

  try {
    // Skip low-quality responses
    if (ctx.response.length < 100) return;
    if (ctx.qualityScore && ctx.qualityScore < 30) {
      console.log(`⚗️ [ALZUR] Skipping low-quality sample (${ctx.qualityScore}/100)`);
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Deduplication Check (Block 3 - SimHash)
    // ─────────────────────────────────────────────────────────────────────────
    const sampleContent = `Q: ${ctx.originalPrompt}\n\nA: ${ctx.response.slice(0, 2000)}`;

    if (lastSampleContent && isDuplicate(sampleContent, lastSampleContent, 0.85)) {
      console.log(`⚗️ [ALZUR] Skipping duplicate sample`);
      return;
    }
    lastSampleContent = sampleContent;

    trainingSampleCount++;
    const sampleId = `alzur-${Date.now()}-${trainingSampleCount}`;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Save to RAG (async queue from Block 8)
    // ─────────────────────────────────────────────────────────────────────────
    ragWriteQueue.enqueue(async () => {
      try {
        await invoke('learning_rag_add', {
          id: sampleId,
          content: sampleContent,
          metadata: {
            type: 'training_sample',
            prompt: ctx.originalPrompt.slice(0, 200),
            response_length: ctx.response.length,
            has_code: ctx.response.includes('```'),
            quality_score: ctx.qualityScore || 0,
            model_used: ctx.modelUsed || BASE_MODEL,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.warn('Failed to save to RAG:', err);
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Add to Per-Project Profile (Block 10)
    // ─────────────────────────────────────────────────────────────────────────
    try {
      addMemoryToProfile(workingDirectory, {
        content: sampleContent,
        embedding: [],
        tags: [
          'alzur',
          'learned',
          ctx.qualityScore && ctx.qualityScore > 70 ? 'high-quality' : 'standard',
        ],
        score: (ctx.qualityScore || 50) / 100,
        hitCount: 0,
        type: 'context',
      });
      updateProjectPreferences(workingDirectory, `${ctx.originalPrompt} ${ctx.response}`);
    } catch {
      // Profile update failed
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Add to Training Buffer
    // ─────────────────────────────────────────────────────────────────────────
    const sample: SimpleSample = {
      id: sampleId,
      prompt: ctx.originalPrompt,
      completion: ctx.response,
      quality: ctx.qualityScore || 50,
      timestamp: Date.now(),
    };
    trainingBuffer.push(sample);

    console.log(
      `⚗️ [ALZUR] Sample #${trainingSampleCount} saved (buffer: ${trainingBuffer.length}/${MICRO_BATCH_SIZE})`,
    );

    await saveAgentMemory({
      agent: 'Alzur',
      entryType: 'fact',
      content: `[Sample #${trainingSampleCount}] Q: ${ctx.originalPrompt.slice(0, 40)}... → quality: ${ctx.qualityScore || '?'}/100`,
      tags: 'training-sample,rag,continuous',
    });

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Trigger Training Pipeline (Block 4)
    // ─────────────────────────────────────────────────────────────────────────
    if (trainingBuffer.length >= MICRO_BATCH_SIZE && !isTraining) {
      runTrainingPipeline().catch((err) => {
        console.warn('Training pipeline failed:', err);
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Periodic Memory Pruning (Block 10)
    // ─────────────────────────────────────────────────────────────────────────
    if (trainingSampleCount % 50 === 0) {
      try {
        const pruneResult = pruneProjectMemories(workingDirectory, {
          maxAgeDays: 30,
          minScore: 0.3,
          minHitCount: 2,
        });
        if (pruneResult.pruned > 0) {
          console.log(`⚗️ [ALZUR] Pruned ${pruneResult.pruned} old memories`);
        }
      } catch {
        // Pruning failed
      }
    }

    // Update Alzur status (Block 9)
    analytics.updateAlzurStatus({
      samples: trainingSampleCount,
      bufferSize: trainingBuffer.length,
      modelVersion: `v${currentModelVersion}`,
      isTraining,
    });
  } catch (err) {
    console.warn('Alzur training check failed:', err);
  }
}

/**
 * Run training pipeline (Block 4)
 */
async function runTrainingPipeline(): Promise<void> {
  if (isTraining || trainingBuffer.length < MICRO_BATCH_SIZE) return;

  isTraining = true;
  const batch = [...trainingBuffer];
  trainingBuffer = [];

  try {
    await saveAgentMemory({
      agent: 'Alzur',
      entryType: 'decision',
      content: `[TRAINING] Starting batch training with ${batch.length} samples`,
      tags: 'training,batch,started',
    });

    // Convert to training pipeline format (TrainingSample requires topics)
    const trainingSamples = batch.map((s) => ({
      prompt: s.prompt,
      completion: s.completion,
      quality: s.quality,
      topics: extractKeywords(s.prompt).slice(0, 3),
    }));

    // Sort by curriculum (Block 4)
    const sorted = sortByCurriculum(trainingSamples);
    console.log(`⚗️ [ALZUR] Curriculum sorted ${sorted.length} samples`);

    // Augment high-quality samples (Block 4)
    const augmented = [...trainingSamples];
    for (const s of trainingSamples.filter((x) => x.quality > 70)) {
      try {
        const aug = augmentSample(
          {
            prompt: s.prompt,
            completion: s.completion,
            quality: s.quality,
            topics: s.topics,
          },
          ['synonym_replacement'],
        );
        augmented.push(
          ...aug.slice(0, 1).map((a) => ({
            prompt: a.prompt,
            completion: a.completion,
            quality: a.quality * 0.9,
            topics: a.topics,
          })),
        );
      } catch {
        // Augmentation failed
      }
    }
    console.log(`⚗️ [ALZUR] Augmented: ${batch.length} → ${augmented.length} samples`);

    // Stratified split (Block 4)
    const split = stratifiedSplit(augmented, 0.9);
    console.log(`⚗️ [ALZUR] Split: ${split.train.length} train / ${split.eval.length} eval`);

    // Create RLHF pairs for high-quality (Block 4)
    const highQuality = split.train.filter((s) => s.quality > 80);
    for (let i = 0; i < Math.min(3, highQuality.length); i++) {
      const s = highQuality[i];
      try {
        const pair = createPreferencePair(s, {
          sampleId: `sample-${i}`,
          rating: 5,
          preferredResponse: s.completion,
          rejectedResponse: s.completion.slice(0, s.completion.length / 2),
          timestamp: Date.now(),
        });
        if (pair) {
          console.log(`⚗️ [ALZUR] Created RLHF pair for sample ${i}`);
        }
      } catch {
        // Pair creation failed
      }
    }

    // Extract patterns and create model
    const patterns = extractLearningPatterns(batch);
    const systemPrompt = buildLearnedSystemPrompt(patterns);
    const newModelName = `alzur-v${++currentModelVersion}`;

    const result = await invoke<{ success: boolean; error?: string }>('start_model_training', {
      config: {
        base_model: BASE_MODEL,
        output_model: newModelName,
        dataset_path: `alzur_patterns_v${currentModelVersion}.txt`,
        epochs: 1,
        learning_rate: 0.0001,
        batch_size: augmented.length,
      },
    });

    if (result.success) {
      await invoke('write_training_dataset', {
        filename: `alzur_patterns_v${currentModelVersion}.txt`,
        content: systemPrompt,
      });

      // Register in model registry (Block 5)
      const modelRegistry = useModelRegistry.getState();
      modelRegistry.registerModel({
        name: newModelName,
        baseModel: BASE_MODEL,
        version: `v${currentModelVersion}`,
        sampleCount: augmented.length,
        metrics: {
          accuracy: 0,
          latencyMs: 0,
          tokensPerSecond: 0,
          errorRate: 0,
          userSatisfaction: 0,
          totalRequests: 0,
          successfulRequests: 0,
        },
        isActive: true,
        tags: ['alzur', 'auto-trained'],
        description: `Auto-trained on ${batch.length} samples`,
      });

      // Update analytics (Block 9)
      useAnalyticsStore.getState().addModelVersion(newModelName);

      await saveAgentMemory({
        agent: 'Alzur',
        entryType: 'fact',
        content: `[MODEL READY] ${newModelName} - ${augmented.length} samples`,
        tags: 'model-ready,upgrade-complete',
      });

      console.log(`✅ [ALZUR] Model ${newModelName} created successfully`);
    } else {
      throw new Error(result.error || 'Model creation failed');
    }
  } catch (err) {
    await saveAgentMemory({
      agent: 'Alzur',
      entryType: 'error',
      content: `[TRAINING FAILED] ${err instanceof Error ? err.message : 'Unknown error'}`,
      tags: 'training,failed',
    });
    trainingBuffer = [...batch, ...trainingBuffer];
  } finally {
    isTraining = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'need',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'and',
    'but',
    'if',
    'or',
    'what',
    'which',
    'who',
    'this',
    'that',
    'i',
    'me',
    'my',
    'we',
    'our',
    'you',
    'your',
    'he',
    'him',
    'she',
    'her',
    'it',
    'its',
    'they',
    'them',
    'their',
    'please',
    'help',
    'want',
    'like',
    'jak',
    'co',
    'czy',
    'to',
    'na',
    'w',
    'z',
    'do',
    'i',
    'a',
    'ale',
  ]);

  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !stopWords.has(word)),
    ),
  ]
    .sort((a, b) => b.length - a.length)
    .slice(0, 5);
}

async function searchStackOverflow(query: string): Promise<SOQuestion[]> {
  try {
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=3`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return data.items || [];
  } catch {
    return [];
  }
}

async function searchWeb(query: string): Promise<string[]> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    const results: string[] = [];
    if (data.Abstract) results.push(data.Abstract.slice(0, 200));
    if (data.RelatedTopics) {
      data.RelatedTopics.slice(0, 2).forEach((topic: { Text?: string }) => {
        if (topic.Text) results.push(topic.Text.slice(0, 150));
      });
    }
    return results;
  } catch {
    return [];
  }
}

function extractInsights(response: string): string[] {
  const insights: string[] = [];
  const codeBlocks = response.match(/```[\s\S]*?```/g);
  if (codeBlocks?.length) {
    insights.push(`Contains ${codeBlocks.length} code example(s)`);
  }
  const patterns = [/best practice/gi, /recommended/gi, /important/gi, /avoid/gi];
  for (const pattern of patterns) {
    if (pattern.test(response)) {
      const match = response.match(pattern);
      if (match) {
        const idx = response.search(pattern);
        const start = Math.max(0, response.lastIndexOf('.', idx) + 1);
        const end = response.indexOf('.', idx + match[0].length);
        const sentence = response
          .slice(start, end > 0 ? end + 1 : undefined)
          .trim()
          .slice(0, 150);
        if (sentence) insights.push(sentence);
      }
    }
  }
  return insights.slice(0, 5);
}

function extractLearningPatterns(samples: SimpleSample[]) {
  const topics = new Set<string>();
  const codePatterns = new Set<string>();
  const responseStyles: string[] = [];

  for (const sample of samples) {
    const words = sample.prompt.toLowerCase().split(/\s+/);
    const techTerms = words.filter(
      (w) =>
        w.length > 4 &&
        /^[a-z]+$/i.test(w) &&
        [
          'react',
          'typescript',
          'javascript',
          'python',
          'rust',
          'api',
          'docker',
          'database',
          'function',
          'component',
          'async',
          'hook',
          'state',
          'redux',
          'graphql',
          'rest',
          'http',
          'websocket',
          'node',
          'npm',
          'git',
        ].some((t) => w.includes(t)),
    );
    techTerms.forEach((t) => topics.add(t));

    const codeBlocks = sample.completion.match(/```(\w+)?\n[\s\S]*?```/g) || [];
    codeBlocks.forEach((block) => {
      const lang = block.match(/```(\w+)/)?.[1];
      if (lang) codePatterns.add(lang);
    });

    if (sample.completion.length > 500) responseStyles.push('detailed');
    if (sample.completion.includes('```')) responseStyles.push('code-heavy');
    if (sample.completion.includes('1.') || sample.completion.includes('- '))
      responseStyles.push('structured');
  }

  const styleCounts = responseStyles.reduce(
    (acc, s) => {
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const preferredStyle =
    Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'balanced';

  return {
    topics: [...topics],
    codePatterns: [...codePatterns],
    preferredStyle,
    sampleCount: samples.length,
  };
}

function buildLearnedSystemPrompt(patterns: ReturnType<typeof extractLearningPatterns>): string {
  return `You are an AI assistant that has learned from ${patterns.sampleCount} interactions.

LEARNED EXPERTISE:
${patterns.topics.length > 0 ? `- Topics: ${patterns.topics.slice(0, 10).join(', ')}` : '- General programming knowledge'}
${patterns.codePatterns.length > 0 ? `- Languages: ${patterns.codePatterns.join(', ')}` : ''}

RESPONSE STYLE: ${patterns.preferredStyle}
- Provide clear, actionable answers
- Include code examples when relevant
- Use structured formatting for complex topics

CONTINUOUS LEARNING:
This model improves with each interaction. Knowledge is stored in RAG for context retrieval.
Model version: alzur-v${currentModelVersion}
Total samples learned: ${trainingSampleCount}`;
}

async function saveAgentMemory(entry: AgentMemoryEntry): Promise<void> {
  try {
    await invoke('add_agent_memory', {
      agent: entry.agent,
      entryType: entry.entryType,
      content: entry.content,
      tags: entry.tags,
    });
  } catch (err) {
    console.warn('Failed to save agent memory:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

export function getAlzurStatus() {
  return {
    samples: trainingSampleCount,
    buffer: trainingBuffer.length,
    isTraining,
    modelVersion: currentModelVersion,
    sessionId,
  };
}

export function setWorkingDirectory(dir: string) {
  workingDirectory = dir;
  console.log(`📁 Working directory set to: ${dir}`);
}

export function getSessionQuality() {
  return calculateSessionScore(sessionId);
}

export function recordFeedback(messageId: string, rating: 'up' | 'down') {
  useFeedbackStore.getState().setRating(messageId, rating);
}

export function usePromptPipeline() {
  const pipelineRef = useRef<PipelineContext | null>(null);

  useEffect(() => {
    sessionId = `session-${Date.now()}`;
    console.log(`🐺 Wolf Pack Pipeline initialized (session: ${sessionId})`);
    ragWriteQueue.process();
    return () => {};
  }, []);

  const processPrompt = useCallback(
    async (
      prompt: string,
      aiProcessor: (enrichedPrompt: string, model?: string) => Promise<string>,
    ): Promise<{ response: string; context: PipelineContext }> => {
      const startTime = performance.now();

      // Stage 1: Avallac'h
      const preResult = await avallachPreProcess(prompt);
      const preProcessTime = performance.now() - startTime;

      // Stage 2: AI
      const aiStartTime = performance.now();
      const modelSelection = selectModel(prompt);
      const response = await aiProcessor(preResult.enrichedPrompt, modelSelection.model);
      const aiTime = performance.now() - aiStartTime;

      const pipelineContext: PipelineContext = {
        originalPrompt: prompt,
        enrichedPrompt: preResult.enrichedPrompt,
        researchContext: preResult.context,
        response,
        learnings: [],
        timestamp: Date.now(),
        expandedQuery: preResult.expandedQuery,
        modelUsed: modelSelection.model,
        timings: {
          preProcess: preProcessTime,
          aiGeneration: aiTime,
          postProcess: 0,
          training: 0,
          total: 0,
        },
      };

      pipelineRef.current = pipelineContext;

      // Stage 3 & 4: Vilgefortz + Alzur (async, fire-and-forget with error handling)
      vilgefortzPostProcess(pipelineContext)
        .then(async (learnings) => {
          if (pipelineRef.current) {
            pipelineRef.current.learnings = learnings;
          }
          await alzurTrainingCheck(pipelineContext);
        })
        .catch((err) => {
          console.error('[Pipeline] Post-processing/training failed:', err);
        });

      return { response, context: pipelineContext };
    },
    [],
  );

  const processQuick = useCallback(
    async (
      prompt: string,
      aiProcessor: (prompt: string, model?: string) => Promise<string>,
    ): Promise<string> => {
      const modelSelection = selectModel(prompt);
      const response = await aiProcessor(prompt, modelSelection.model);

      const ctx: PipelineContext = {
        originalPrompt: prompt,
        enrichedPrompt: prompt,
        researchContext: [],
        response,
        learnings: [],
        timestamp: Date.now(),
        modelUsed: modelSelection.model,
      };

      vilgefortzPostProcess(ctx)
        .then(() => alzurTrainingCheck(ctx))
        .catch((err) => {
          console.error('[Pipeline] Quick post-processing failed:', err);
        });
      return response;
    },
    [],
  );

  const needsResearch = useCallback((prompt: string): boolean => {
    const techKeywords = [
      'how to',
      'what is',
      'why',
      'error',
      'bug',
      'fix',
      'implement',
      'create',
      'build',
      'setup',
      'configure',
      'install',
      'deploy',
      'jak',
      'dlaczego',
      'błąd',
      'napraw',
      'zaimplementuj',
      'stwórz',
    ];
    return techKeywords.some((kw) => prompt.toLowerCase().includes(kw));
  }, []);

  return {
    processPrompt,
    processQuick,
    needsResearch,
    lastContext: pipelineRef.current,
  };
}

export default usePromptPipeline;
