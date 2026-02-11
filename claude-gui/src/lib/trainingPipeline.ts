/**
 * @fileoverview Training Pipeline Enhancement - Block 4
 *
 * Advanced training pipeline features for AI learning system:
 * 1. Curriculum learning - progressive complexity sorting
 * 2. Data augmentation - generate training variations
 * 3. Active learning - uncertainty-based sample selection
 * 4. RLHF pair generation - preference learning from feedback
 * 5. Validation split - stratified train/eval partitioning
 *
 * @module lib/trainingPipeline
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Training sample with metadata for curriculum and stratification
 */
export interface TrainingSample {
  prompt: string;
  completion: string;
  quality: number;
  topics: string[];
}

/**
 * Extended sample with computed complexity metrics
 */
export interface TrainingSampleWithMetrics extends TrainingSample {
  id: string;
  complexity: number;
  codeBlockCount: number;
  promptLength: number;
  completionLength: number;
}

/**
 * Augmented sample with source tracking
 */
export interface AugmentedSample extends TrainingSample {
  augmentationType: AugmentationType;
  originalId?: string;
}

/**
 * Supported augmentation strategies
 */
export type AugmentationType =
  | 'original'
  | 'synonym_replacement'
  | 'back_translation'
  | 'prompt_rephrase'
  | 'noise_injection';

/**
 * Uncertainty metrics for active learning
 */
export interface UncertaintyScore {
  sampleId: string;
  entropy: number;
  variance: number;
  confidenceGap: number;
  overallUncertainty: number;
}

/**
 * RLHF preference pair for DPO training
 */
export interface PreferencePair {
  prompt: string;
  chosen: string;
  rejected: string;
  chosenQuality: number;
  rejectedQuality: number;
  margin: number;
}

/**
 * User feedback for preference pair generation
 */
export interface UserFeedback {
  sampleId: string;
  rating: number; // 1-5 scale
  preferredResponse?: string;
  rejectedResponse?: string;
  timestamp: number;
}

/**
 * Stratified split result
 */
export interface StratifiedSplitResult {
  train: TrainingSample[];
  eval: TrainingSample[];
  trainTopicDistribution: Record<string, number>;
  evalTopicDistribution: Record<string, number>;
  trainComplexityStats: ComplexityStats;
  evalComplexityStats: ComplexityStats;
}

/**
 * Complexity statistics for a dataset split
 */
export interface ComplexityStats {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  quartiles: [number, number, number];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique ID for samples
 */
function generateId(): string {
  return `sample_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Count code blocks in text (markdown fenced blocks)
 */
function countCodeBlocks(text: string): number {
  const matches = text.match(/```[\s\S]*?```/g);
  return matches ? matches.length : 0;
}

/**
 * Calculate complexity score for a sample
 * Combines prompt length, completion length, and code block count
 */
function calculateComplexity(sample: TrainingSample): number {
  const promptWeight = 0.3;
  const completionWeight = 0.5;
  const codeBlockWeight = 0.2;

  const promptScore = Math.min(sample.prompt.length / 1000, 1);
  const completionScore = Math.min(sample.completion.length / 5000, 1);
  const codeBlocks = countCodeBlocks(sample.prompt) + countCodeBlocks(sample.completion);
  const codeScore = Math.min(codeBlocks / 5, 1);

  return (
    promptScore * promptWeight + completionScore * completionWeight + codeScore * codeBlockWeight
  );
}

/**
 * Compute statistics for an array of numbers
 */
function computeStats(values: number[]): ComplexityStats {
  if (values.length === 0) {
    return {
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      quartiles: [0, 0, 0],
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;

  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sorted.length;
  const stdDev = Math.sqrt(variance);

  const q1Index = Math.floor(sorted.length * 0.25);
  const q2Index = Math.floor(sorted.length * 0.5);
  const q3Index = Math.floor(sorted.length * 0.75);

  return {
    mean,
    median,
    stdDev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    quartiles: [sorted[q1Index], sorted[q2Index], sorted[q3Index]],
  };
}

/**
 * Shuffle array using Fisher-Yates algorithm with seed
 */
function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let currentSeed = seed;

  const random = (): number => {
    const x = Math.sin(currentSeed++) * 10000;
    return x - Math.floor(x);
  };

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

// ============================================================================
// 1. Curriculum Learning - Sort by Complexity
// ============================================================================

/**
 * Sorts training samples by complexity for curriculum learning.
 * Easier samples (lower complexity) come first, progressing to harder ones.
 *
 * Complexity is calculated based on:
 * - Prompt length (30% weight)
 * - Completion/response length (50% weight)
 * - Number of code blocks (20% weight)
 *
 * @param samples - Array of training samples to sort
 * @param ascending - Sort order: true = easy-to-hard (default), false = hard-to-easy
 * @returns Sorted samples with computed complexity metrics
 *
 * @example
 * const samples = [
 *   { prompt: "What is 2+2?", completion: "4", quality: 1.0, topics: ["math"] },
 *   { prompt: "Explain quantum computing...", completion: "...", quality: 0.9, topics: ["physics"] }
 * ];
 * const sorted = sortByCurriculum(samples);
 * // Returns samples ordered from simple to complex
 */
export function sortByCurriculum(
  samples: TrainingSample[],
  ascending: boolean = true,
): TrainingSampleWithMetrics[] {
  const samplesWithMetrics: TrainingSampleWithMetrics[] = samples.map((sample) => ({
    ...sample,
    id: generateId(),
    complexity: calculateComplexity(sample),
    codeBlockCount: countCodeBlocks(sample.prompt) + countCodeBlocks(sample.completion),
    promptLength: sample.prompt.length,
    completionLength: sample.completion.length,
  }));

  return samplesWithMetrics.sort((a, b) =>
    ascending ? a.complexity - b.complexity : b.complexity - a.complexity,
  );
}

// ============================================================================
// 2. Data Augmentation - Generate Variations
// ============================================================================

/**
 * Synonym map for common programming/AI terms
 */
const SYNONYM_MAP: Record<string, string[]> = {
  function: ['method', 'procedure', 'routine'],
  variable: ['var', 'parameter', 'field'],
  create: ['make', 'generate', 'build'],
  delete: ['remove', 'erase', 'clear'],
  update: ['modify', 'change', 'alter'],
  explain: ['describe', 'clarify', 'elaborate on'],
  implement: ['code', 'develop', 'write'],
  error: ['bug', 'issue', 'problem'],
  fix: ['repair', 'resolve', 'correct'],
  optimize: ['improve', 'enhance', 'speed up'],
  array: ['list', 'collection', 'sequence'],
  object: ['instance', 'entity', 'struct'],
};

/**
 * Rephrase templates for prompt variation
 */
const REPHRASE_TEMPLATES: Array<(prompt: string) => string> = [
  (p) => `Can you help me with: ${p}`,
  (p) => `I need assistance with the following: ${p}`,
  (p) => `Please address this: ${p}`,
  (p) => `How would you approach: ${p}`,
  (p) => `I'm wondering about: ${p}`,
  (p) => `Could you explain: ${p}`,
];

/**
 * Simulated back-translation transformations
 * Mimics the effect of translating to another language and back
 */
const BACK_TRANSLATION_TRANSFORMS: Array<(text: string) => string> = [
  // Passive voice transformation
  (t) => t.replace(/I want to (\w+)/gi, 'It is desired to $1'),
  // Formal transformation
  (t) => t.replace(/can you/gi, 'could you please'),
  // Restructure questions
  (t) => t.replace(/How do I (\w+)/gi, 'What is the way to $1'),
  // Add politeness markers
  (t) => t.replace(/^(\w)/i, 'Kindly, $1'),
];

/**
 * Augments a training sample by generating variations.
 *
 * Supported augmentation strategies:
 * - synonym_replacement: Replace common terms with synonyms
 * - back_translation: Simulate translation effects (paraphrasing)
 * - prompt_rephrase: Apply different question templates
 *
 * @param sample - Original training sample
 * @param strategies - Array of augmentation strategies to apply
 * @param count - Number of augmented samples to generate per strategy
 * @returns Array of augmented samples including original
 *
 * @example
 * const original = { prompt: "Create a function", completion: "...", quality: 1.0, topics: ["code"] };
 * const augmented = augmentSample(original, ['synonym_replacement', 'prompt_rephrase'], 2);
 * // Returns original + 2 synonym variants + 2 rephrase variants = 5 samples
 */
export function augmentSample(
  sample: TrainingSample,
  strategies: AugmentationType[] = ['synonym_replacement', 'prompt_rephrase'],
  count: number = 1,
): AugmentedSample[] {
  const originalId = generateId();
  const results: AugmentedSample[] = [{ ...sample, augmentationType: 'original', originalId }];

  for (const strategy of strategies) {
    for (let i = 0; i < count; i++) {
      let augmented: AugmentedSample | null = null;

      switch (strategy) {
        case 'synonym_replacement':
          augmented = applySynonymReplacement(sample, i);
          break;
        case 'back_translation':
          augmented = applyBackTranslation(sample, i);
          break;
        case 'prompt_rephrase':
          augmented = applyPromptRephrase(sample, i);
          break;
        case 'noise_injection':
          augmented = applyNoiseInjection(sample);
          break;
      }

      if (augmented) {
        augmented.originalId = originalId;
        augmented.augmentationType = strategy;
        results.push(augmented);
      }
    }
  }

  return results;
}

/**
 * Apply synonym replacement to prompt
 */
function applySynonymReplacement(sample: TrainingSample, variantIndex: number): AugmentedSample {
  let modifiedPrompt = sample.prompt;

  for (const [word, synonyms] of Object.entries(SYNONYM_MAP)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(modifiedPrompt)) {
      const synonymIndex = (variantIndex + word.length) % synonyms.length;
      modifiedPrompt = modifiedPrompt.replace(regex, synonyms[synonymIndex]);
    }
  }

  return {
    ...sample,
    prompt: modifiedPrompt,
    augmentationType: 'synonym_replacement',
    quality: sample.quality * 0.95, // Slight quality reduction for augmented data
  };
}

/**
 * Apply simulated back-translation
 */
function applyBackTranslation(sample: TrainingSample, variantIndex: number): AugmentedSample {
  const transformIndex = variantIndex % BACK_TRANSLATION_TRANSFORMS.length;
  const transform = BACK_TRANSLATION_TRANSFORMS[transformIndex];

  return {
    ...sample,
    prompt: transform(sample.prompt),
    augmentationType: 'back_translation',
    quality: sample.quality * 0.9,
  };
}

/**
 * Apply prompt rephrasing template
 */
function applyPromptRephrase(sample: TrainingSample, variantIndex: number): AugmentedSample {
  const templateIndex = variantIndex % REPHRASE_TEMPLATES.length;
  const template = REPHRASE_TEMPLATES[templateIndex];

  return {
    ...sample,
    prompt: template(sample.prompt),
    augmentationType: 'prompt_rephrase',
    quality: sample.quality * 0.95,
  };
}

/**
 * Apply noise injection (typos, minor errors)
 */
function applyNoiseInjection(sample: TrainingSample): AugmentedSample {
  let modifiedPrompt = sample.prompt;

  // Randomly swap adjacent characters (simulate typos)
  if (modifiedPrompt.length > 10) {
    const pos = Math.floor(Math.random() * (modifiedPrompt.length - 2)) + 1;
    const chars = modifiedPrompt.split('');
    [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];
    modifiedPrompt = chars.join('');
  }

  return {
    ...sample,
    prompt: modifiedPrompt,
    augmentationType: 'noise_injection',
    quality: sample.quality * 0.85,
  };
}

// ============================================================================
// 3. Active Learning - Uncertainty Scoring
// ============================================================================

/**
 * Variance signal sources for uncertainty estimation
 */
export interface VarianceSignals {
  /** Multiple model responses for the same prompt */
  responses?: string[];
  /** Confidence scores from model (0-1) */
  confidenceScores?: number[];
  /** Token-level probabilities */
  tokenProbabilities?: number[];
  /** Response length variation */
  responseLengths?: number[];
  /** Quality ratings from evaluators */
  qualityRatings?: number[];
}

/**
 * Calculates uncertainty score for active learning sample selection.
 *
 * Higher uncertainty = model is less confident = more valuable for training.
 * Uses multiple signals:
 * - Response entropy (diversity of outputs)
 * - Confidence variance (inconsistent confidence)
 * - Confidence gap (margin between top predictions)
 *
 * @param sampleId - Unique identifier for the sample
 * @param signals - Variance signals from model inference
 * @returns Uncertainty metrics for the sample
 *
 * @example
 * const uncertainty = calculateUncertainty('sample_1', {
 *   responses: ['answer1', 'answer2', 'answer1'],
 *   confidenceScores: [0.7, 0.6, 0.8],
 *   responseLengths: [100, 150, 90]
 * });
 * // Returns { sampleId: 'sample_1', entropy: 0.6, variance: 0.2, ... }
 */
export function calculateUncertainty(sampleId: string, signals: VarianceSignals): UncertaintyScore {
  let entropy = 0;
  let variance = 0;
  let confidenceGap = 0;

  // Calculate response entropy from response diversity
  if (signals.responses && signals.responses.length > 1) {
    const uniqueResponses = new Set(signals.responses);
    const uniqueRatio = uniqueResponses.size / signals.responses.length;
    entropy = uniqueRatio; // Higher = more diverse responses = more uncertain
  }

  // Calculate variance from confidence scores
  if (signals.confidenceScores && signals.confidenceScores.length > 1) {
    const mean =
      signals.confidenceScores.reduce((a, b) => a + b, 0) / signals.confidenceScores.length;
    variance =
      signals.confidenceScores.reduce((acc, score) => acc + (score - mean) ** 2, 0) /
      signals.confidenceScores.length;
    variance = Math.sqrt(variance); // Standard deviation
  }

  // Calculate confidence gap (lower gap = more uncertain)
  if (signals.confidenceScores && signals.confidenceScores.length >= 2) {
    const sorted = [...signals.confidenceScores].sort((a, b) => b - a);
    confidenceGap = 1 - (sorted[0] - sorted[1]); // Invert so higher = more uncertain
  }

  // Include response length variance as additional signal
  let lengthVariance = 0;
  if (signals.responseLengths && signals.responseLengths.length > 1) {
    const meanLength =
      signals.responseLengths.reduce((a, b) => a + b, 0) / signals.responseLengths.length;
    const lengthStdDev = Math.sqrt(
      signals.responseLengths.reduce((acc, len) => acc + (len - meanLength) ** 2, 0) /
        signals.responseLengths.length,
    );
    lengthVariance = Math.min(lengthStdDev / meanLength, 1); // Coefficient of variation, capped at 1
  }

  // Include quality rating variance
  let qualityVariance = 0;
  if (signals.qualityRatings && signals.qualityRatings.length > 1) {
    const meanQuality =
      signals.qualityRatings.reduce((a, b) => a + b, 0) / signals.qualityRatings.length;
    qualityVariance =
      Math.sqrt(
        signals.qualityRatings.reduce((acc, q) => acc + (q - meanQuality) ** 2, 0) /
          signals.qualityRatings.length,
      ) / 5; // Normalize by max rating
  }

  // Weighted combination of uncertainty signals
  const weights = {
    entropy: 0.3,
    variance: 0.25,
    confidenceGap: 0.25,
    lengthVariance: 0.1,
    qualityVariance: 0.1,
  };

  const overallUncertainty =
    entropy * weights.entropy +
    variance * weights.variance +
    confidenceGap * weights.confidenceGap +
    lengthVariance * weights.lengthVariance +
    qualityVariance * weights.qualityVariance;

  return {
    sampleId,
    entropy,
    variance,
    confidenceGap,
    overallUncertainty: Math.min(overallUncertainty, 1), // Cap at 1
  };
}

/**
 * Select top-k most uncertain samples for active learning
 */
export function selectUncertainSamples(
  samples: Array<{ id: string; signals: VarianceSignals }>,
  k: number,
): UncertaintyScore[] {
  const scores = samples.map((s) => calculateUncertainty(s.id, s.signals));
  return scores.sort((a, b) => b.overallUncertainty - a.overallUncertainty).slice(0, k);
}

// ============================================================================
// 4. RLHF Pair Generation - Preference Learning
// ============================================================================

/**
 * Creates a preference pair for RLHF/DPO training from user feedback.
 *
 * Generates chosen/rejected pairs based on:
 * - Explicit user preference (if both responses provided)
 * - Quality score comparison
 * - Rating threshold (rating >= 4 = chosen, rating <= 2 = rejected)
 *
 * @param originalSample - The original training sample
 * @param feedback - User feedback with rating and optional alternative response
 * @param alternativeResponse - Alternative response for comparison (optional)
 * @returns Preference pair if valid, null otherwise
 *
 * @example
 * const pair = createPreferencePair(
 *   { prompt: "Explain closures", completion: "...", quality: 0.8, topics: ["js"] },
 *   { sampleId: "1", rating: 5, timestamp: Date.now() },
 *   "A better explanation of closures..."
 * );
 * // Returns { prompt: "Explain closures", chosen: "...", rejected: "...", margin: 0.4 }
 */
export function createPreferencePair(
  originalSample: TrainingSample,
  feedback: UserFeedback,
  alternativeResponse?: string,
): PreferencePair | null {
  // Case 1: Explicit preference from feedback
  if (feedback.preferredResponse && feedback.rejectedResponse) {
    return {
      prompt: originalSample.prompt,
      chosen: feedback.preferredResponse,
      rejected: feedback.rejectedResponse,
      chosenQuality: feedback.rating / 5, // Normalize to 0-1
      rejectedQuality: (5 - feedback.rating) / 5,
      margin: feedback.rating / 5,
    };
  }

  // Case 2: Original vs alternative comparison
  if (alternativeResponse) {
    const isOriginalPreferred = feedback.rating >= 3;

    return {
      prompt: originalSample.prompt,
      chosen: isOriginalPreferred ? originalSample.completion : alternativeResponse,
      rejected: isOriginalPreferred ? alternativeResponse : originalSample.completion,
      chosenQuality: isOriginalPreferred ? originalSample.quality : feedback.rating / 5,
      rejectedQuality: isOriginalPreferred ? feedback.rating / 5 : originalSample.quality,
      margin: Math.abs(originalSample.quality - feedback.rating / 5),
    };
  }

  // Case 3: Generate synthetic rejection (lower quality variant)
  if (feedback.rating >= 4) {
    // High-rated sample: create synthetic rejection by truncating/simplifying
    const rejectedResponse = createSyntheticRejection(originalSample.completion);

    return {
      prompt: originalSample.prompt,
      chosen: originalSample.completion,
      rejected: rejectedResponse,
      chosenQuality: originalSample.quality,
      rejectedQuality: originalSample.quality * 0.5,
      margin: originalSample.quality * 0.5,
    };
  }

  // Case 4: Low-rated sample - insufficient data for pair
  return null;
}

/**
 * Create synthetic rejected response by degrading quality
 */
function createSyntheticRejection(response: string): string {
  // Strategy 1: Truncate response (incomplete answer)
  if (response.length > 200) {
    const truncatePoint = Math.floor(response.length * 0.4);
    return `${response.slice(0, truncatePoint)}...`;
  }

  // Strategy 2: Remove code blocks (less helpful)
  const withoutCode = response.replace(/```[\s\S]*?```/g, '[code omitted]');
  if (withoutCode !== response) {
    return withoutCode;
  }

  // Strategy 3: Generic unhelpful response
  return "I'm not sure about that. You might want to look it up.";
}

/**
 * Batch generate preference pairs from feedback collection
 */
export function batchCreatePreferencePairs(
  samples: TrainingSample[],
  feedbackMap: Map<string, UserFeedback>,
  alternativeResponses?: Map<string, string>,
): PreferencePair[] {
  const pairs: PreferencePair[] = [];

  for (const sample of samples) {
    const sampleId = generateId(); // In real usage, samples would have stable IDs
    const feedback = feedbackMap.get(sampleId);

    if (feedback) {
      const alternative = alternativeResponses?.get(sampleId);
      const pair = createPreferencePair(sample, feedback, alternative);
      if (pair) {
        pairs.push(pair);
      }
    }
  }

  return pairs;
}

// ============================================================================
// 5. Validation Split - Stratified Partitioning
// ============================================================================

/**
 * Creates a stratified train/eval split maintaining topic and complexity distribution.
 *
 * Ensures both train and eval sets have representative samples from:
 * - All topic categories (proportional representation)
 * - All complexity levels (similar distribution)
 *
 * @param samples - Array of training samples to split
 * @param evalRatio - Ratio for evaluation set (default: 0.1 = 10%)
 * @param seed - Random seed for reproducibility
 * @returns Split result with distribution statistics
 *
 * @example
 * const samples = [
 *   { prompt: "...", completion: "...", quality: 0.9, topics: ["math", "basics"] },
 *   { prompt: "...", completion: "...", quality: 0.8, topics: ["physics"] },
 *   // ... more samples
 * ];
 * const { train, eval } = stratifiedSplit(samples, 0.1, 42);
 * // Returns 90% train, 10% eval with matched topic/complexity distributions
 */
export function stratifiedSplit(
  samples: TrainingSample[],
  evalRatio: number = 0.1,
  seed: number = 42,
): StratifiedSplitResult {
  if (samples.length === 0) {
    return {
      train: [],
      eval: [],
      trainTopicDistribution: {},
      evalTopicDistribution: {},
      trainComplexityStats: computeStats([]),
      evalComplexityStats: computeStats([]),
    };
  }

  // Step 1: Group samples by primary topic and complexity bucket
  const buckets = new Map<string, TrainingSample[]>();

  for (const sample of samples) {
    const complexity = calculateComplexity(sample);
    const complexityBucket = Math.floor(complexity * 10); // 0-10 buckets
    const primaryTopic = sample.topics[0] || 'general';
    const bucketKey = `${primaryTopic}_${complexityBucket}`;

    const bucket = buckets.get(bucketKey) || [];
    bucket.push(sample);
    buckets.set(bucketKey, bucket);
  }

  // Step 2: Split each bucket proportionally
  const train: TrainingSample[] = [];
  const evalSet: TrainingSample[] = [];

  const bucketEntries = Array.from(buckets.entries());
  for (const [bucketKey, bucketSamples] of bucketEntries) {
    // Shuffle bucket with seed for reproducibility
    const bucketSeed = seed + bucketKey.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const shuffled = shuffleWithSeed(bucketSamples, bucketSeed);

    const evalCount = Math.max(1, Math.round(shuffled.length * evalRatio));

    // Ensure at least one sample goes to each set if bucket has 2+ samples
    if (shuffled.length >= 2) {
      for (const s of shuffled.slice(0, evalCount)) {
        evalSet.push(s);
      }
      for (const s of shuffled.slice(evalCount)) {
        train.push(s);
      }
    } else {
      // Single sample: randomly assign based on seed
      if (bucketSeed % 10 < evalRatio * 10) {
        for (const s of shuffled) {
          evalSet.push(s);
        }
      } else {
        for (const s of shuffled) {
          train.push(s);
        }
      }
    }
  }

  // Step 3: Calculate distribution statistics
  const trainTopicDistribution = calculateTopicDistribution(train);
  const evalTopicDistribution = calculateTopicDistribution(evalSet);

  const trainComplexities = train.map(calculateComplexity);
  const evalComplexities = evalSet.map(calculateComplexity);

  return {
    train,
    eval: evalSet,
    trainTopicDistribution,
    evalTopicDistribution,
    trainComplexityStats: computeStats(trainComplexities),
    evalComplexityStats: computeStats(evalComplexities),
  };
}

/**
 * Calculate topic frequency distribution
 */
function calculateTopicDistribution(samples: TrainingSample[]): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const sample of samples) {
    for (const topic of sample.topics) {
      distribution[topic] = (distribution[topic] || 0) + 1;
    }
  }

  // Convert to percentages
  const total = samples.length;
  for (const topic of Object.keys(distribution)) {
    distribution[topic] = Math.round((distribution[topic] / total) * 100 * 100) / 100;
  }

  return distribution;
}

/**
 * Validate split quality by comparing distributions
 */
export function validateSplitQuality(result: StratifiedSplitResult): {
  isValid: boolean;
  topicDivergence: number;
  complexityDivergence: number;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check topic distribution divergence (KL-like metric)
  const allTopics = Array.from(
    new Set([
      ...Object.keys(result.trainTopicDistribution),
      ...Object.keys(result.evalTopicDistribution),
    ]),
  );

  let topicDivergence = 0;
  for (const topic of allTopics) {
    const trainPct = result.trainTopicDistribution[topic] || 0;
    const evalPct = result.evalTopicDistribution[topic] || 0;
    topicDivergence += Math.abs(trainPct - evalPct);

    if (trainPct > 0 && evalPct === 0) {
      warnings.push(`Topic "${topic}" missing from eval set`);
    }
  }
  topicDivergence /= allTopics.length;

  // Check complexity distribution divergence
  const complexityDivergence = Math.abs(
    result.trainComplexityStats.mean - result.evalComplexityStats.mean,
  );

  if (complexityDivergence > 0.2) {
    warnings.push(
      `High complexity divergence: train=${result.trainComplexityStats.mean.toFixed(3)}, eval=${result.evalComplexityStats.mean.toFixed(3)}`,
    );
  }

  // Validate minimum sample counts
  if (result.eval.length < 10) {
    warnings.push(`Eval set too small: ${result.eval.length} samples`);
  }

  const isValid = topicDivergence < 10 && complexityDivergence < 0.3 && warnings.length === 0;

  return {
    isValid,
    topicDivergence,
    complexityDivergence,
    warnings,
  };
}

// ============================================================================
// Pipeline Integration - Complete Training Workflow
// ============================================================================

/**
 * Configuration for the training pipeline
 */
export interface PipelineConfig {
  curriculumEnabled: boolean;
  augmentationStrategies: AugmentationType[];
  augmentationCount: number;
  activeLearningEnabled: boolean;
  activeLearningTopK: number;
  evalRatio: number;
  randomSeed: number;
}

/**
 * Default pipeline configuration
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  curriculumEnabled: true,
  augmentationStrategies: ['synonym_replacement', 'prompt_rephrase'],
  augmentationCount: 1,
  activeLearningEnabled: true,
  activeLearningTopK: 100,
  evalRatio: 0.1,
  randomSeed: 42,
};

/**
 * Pipeline result with all processed data
 */
export interface PipelineResult {
  originalCount: number;
  augmentedCount: number;
  trainSamples: TrainingSample[];
  evalSamples: TrainingSample[];
  uncertainSamples: UncertaintyScore[];
  preferencePairs: PreferencePair[];
  splitStats: StratifiedSplitResult;
}

/**
 * Run complete training pipeline on samples
 */
export function runTrainingPipeline(
  samples: TrainingSample[],
  config: Partial<PipelineConfig> = {},
  varianceSignals?: Map<string, VarianceSignals>,
  userFeedback?: Map<string, UserFeedback>,
): PipelineResult {
  const fullConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };

  // Step 1: Sort by curriculum (if enabled)
  const processedSamples: TrainingSample[] = fullConfig.curriculumEnabled
    ? sortByCurriculum(samples)
    : samples;

  // Step 2: Augment samples
  const augmented: TrainingSample[] = [];
  for (const sample of processedSamples) {
    const variations = augmentSample(
      sample,
      fullConfig.augmentationStrategies,
      fullConfig.augmentationCount,
    );
    augmented.push(...variations);
  }

  // Step 3: Stratified split
  const splitResult = stratifiedSplit(augmented, fullConfig.evalRatio, fullConfig.randomSeed);

  // Step 4: Active learning (uncertainty scoring)
  let uncertainSamples: UncertaintyScore[] = [];
  if (fullConfig.activeLearningEnabled && varianceSignals) {
    const signalArray = Array.from(varianceSignals.entries()).map(([id, signals]) => ({
      id,
      signals,
    }));
    uncertainSamples = selectUncertainSamples(signalArray, fullConfig.activeLearningTopK);
  }

  // Step 5: Generate preference pairs from feedback
  const preferencePairs: PreferencePair[] = [];
  if (userFeedback) {
    for (const sample of samples) {
      const sampleId = generateId();
      const feedback = userFeedback.get(sampleId);
      if (feedback) {
        const pair = createPreferencePair(sample, feedback);
        if (pair) {
          preferencePairs.push(pair);
        }
      }
    }
  }

  return {
    originalCount: samples.length,
    augmentedCount: augmented.length,
    trainSamples: splitResult.train,
    evalSamples: splitResult.eval,
    uncertainSamples,
    preferencePairs,
    splitStats: splitResult,
  };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  // Core functions
  sortByCurriculum,
  augmentSample,
  calculateUncertainty,
  createPreferencePair,
  stratifiedSplit,

  // Utility functions
  selectUncertainSamples,
  batchCreatePreferencePairs,
  validateSplitQuality,
  runTrainingPipeline,

  // Configuration
  DEFAULT_PIPELINE_CONFIG,
};
