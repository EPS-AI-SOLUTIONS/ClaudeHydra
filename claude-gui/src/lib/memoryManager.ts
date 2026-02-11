/**
 * Memory Management & Personalization Module
 * Block 10: AI Learning System
 *
 * Features:
 * 1. Memory pruning - Delete old, low-score, low-hit memories
 * 2. Memory clustering - Group similar memories and merge
 * 3. User preferences - Auto-extract from interactions
 * 4. Multi-modal placeholders - Interface for future image embeddings
 * 5. Per-project profiles - RAG + preferences keyed by project hash
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

/** Supported embedding types for multi-modal content */
export type EmbeddingType = 'text' | 'image';

/** Multi-modal embedding placeholder interface */
export interface MultiModalEmbedding {
  type: EmbeddingType;
  embedding: number[];
  metadata: {
    source?: string;
    dimensions: number;
    model?: string;
    createdAt: number;
    mimeType?: string; // For images: 'image/png', 'image/jpeg', etc.
    originalSize?: { width: number; height: number }; // For images
  };
}

/** Memory entry with scoring and hit tracking */
export interface MemoryEntry {
  id: string;
  content: string;
  embedding: number[];
  score: number; // Relevance score (0-1)
  hitCount: number; // Number of times accessed
  createdAt: number; // Unix timestamp
  updatedAt: number;
  tags: string[];
  type: 'fact' | 'error' | 'decision' | 'context' | 'preference';
  agent?: string;
  multiModal?: MultiModalEmbedding;
}

/** User preferences extracted from interactions */
export interface UserPreferences {
  preferredLanguage: string; // e.g., 'pl', 'en', 'de'
  frameworks: string[]; // e.g., ['React', 'Tauri', 'Zustand']
  codeStyle: {
    indentation: 'tabs' | 'spaces';
    indentSize: number;
    semicolons: boolean;
    quotes: 'single' | 'double';
    trailingComma: boolean;
    maxLineLength: number;
  };
  responseLength: 'concise' | 'detailed' | 'verbose';
  lastUpdated: number;
  confidenceScores: {
    preferredLanguage: number;
    frameworks: number;
    codeStyle: number;
    responseLength: number;
  };
}

/** Per-project profile with RAG memories and preferences */
export interface ProjectProfile {
  projectKey: string; // MD5 hash of workingDirectory
  workingDirectory: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  memories: MemoryEntry[];
  preferences: UserPreferences;
  ragContext: {
    filePatterns: string[];
    importantFiles: string[];
    techStack: string[];
    projectType: string;
  };
  stats: {
    totalInteractions: number;
    totalMemories: number;
    lastPruned: number;
    lastClustered: number;
  };
}

/** Pruning configuration */
export interface PruneConfig {
  maxAgeDays: number;
  minScore: number;
  minHitCount: number;
}

/** Cluster merge result */
export interface ClusterMergeResult {
  clustersFound: number;
  memoriesMerged: number;
  newMemories: MemoryEntry[];
}

// =============================================================================
// MD5 Hash Implementation (Simple)
// =============================================================================

/**
 * Simple MD5 hash implementation for project key generation
 * Note: Not cryptographically secure, but sufficient for key generation
 */
function md5(input: string): string {
  const rotateLeft = (x: number, n: number): number => (x << n) | (x >>> (32 - n));

  const addUnsigned = (x: number, y: number): number => {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >>> 16) + (y >>> 16) + (lsw >>> 16);
    return (msw << 16) | (lsw & 0xffff);
  };

  const F = (x: number, y: number, z: number): number => (x & y) | (~x & z);
  const G = (x: number, y: number, z: number): number => (x & z) | (y & ~z);
  const H = (x: number, y: number, z: number): number => x ^ y ^ z;
  const I = (x: number, y: number, z: number): number => y ^ (x | ~z);

  const FF = (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number,
  ): number =>
    addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, F(b, c, d)), addUnsigned(x, ac)), s), b);

  const GG = (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number,
  ): number =>
    addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, G(b, c, d)), addUnsigned(x, ac)), s), b);

  const HH = (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number,
  ): number =>
    addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, H(b, c, d)), addUnsigned(x, ac)), s), b);

  const II = (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number,
  ): number =>
    addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, I(b, c, d)), addUnsigned(x, ac)), s), b);

  const convertToWordArray = (str: string): number[] => {
    const lWordCount: number = (((str.length + 8) >>> 6) + 1) * 16;
    const lWordArray: number[] = new Array(lWordCount).fill(0);
    let lByteCount = 0;

    while (lByteCount < str.length) {
      const lWordPosition = (lByteCount - (lByteCount % 4)) / 4;
      const lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordPosition] =
        lWordArray[lWordPosition] | (str.charCodeAt(lByteCount) << lBytePosition);
      lByteCount++;
    }

    const lWordPosition = (lByteCount - (lByteCount % 4)) / 4;
    const lBytePosition = (lByteCount % 4) * 8;
    lWordArray[lWordPosition] = lWordArray[lWordPosition] | (0x80 << lBytePosition);
    lWordArray[lWordCount - 2] = str.length << 3;

    return lWordArray;
  };

  const wordToHex = (lValue: number): string => {
    let result = '';
    for (let lCount = 0; lCount <= 3; lCount++) {
      const lByte = (lValue >>> (lCount * 8)) & 255;
      result += `0${lByte.toString(16)}`.slice(-2);
    }
    return result;
  };

  const x = convertToWordArray(input);
  let a = 0x67452301,
    b = 0xefcdab89,
    c = 0x98badcfe,
    d = 0x10325476;

  const S11 = 7,
    S12 = 12,
    S13 = 17,
    S14 = 22;
  const S21 = 5,
    S22 = 9,
    S23 = 14,
    S24 = 20;
  const S31 = 4,
    S32 = 11,
    S33 = 16,
    S34 = 23;
  const S41 = 6,
    S42 = 10,
    S43 = 15,
    S44 = 21;

  for (let k = 0; k < x.length; k += 16) {
    const AA = a,
      BB = b,
      CC = c,
      DD = d;

    a = FF(a, b, c, d, x[k], S11, 0xd76aa478);
    d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
    c = FF(c, d, a, b, x[k + 2], S13, 0x242070db);
    b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
    a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf);
    d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);
    c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613);
    b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
    a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8);
    d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
    c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1);
    b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
    a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122);
    d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);
    c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e);
    b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);

    a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562);
    d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);
    c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51);
    b = GG(b, c, d, a, x[k], S24, 0xe9b6c7aa);
    a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d);
    d = GG(d, a, b, c, x[k + 10], S22, 0x02441453);
    c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681);
    b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
    a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6);
    d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);
    c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87);
    b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
    a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905);
    d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
    c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9);
    b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);

    a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942);
    d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);
    c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122);
    b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
    a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44);
    d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
    c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);
    b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
    a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6);
    d = HH(d, a, b, c, x[k], S32, 0xeaa127fa);
    c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085);
    b = HH(b, c, d, a, x[k + 6], S34, 0x04881d05);
    a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039);
    d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
    c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);
    b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);

    a = II(a, b, c, d, x[k], S41, 0xf4292244);
    d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);
    c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7);
    b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
    a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3);
    d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
    c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d);
    b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
    a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);
    d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
    c = II(c, d, a, b, x[k + 6], S43, 0xa3014314);
    b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
    a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82);
    d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);
    c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);
    b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);

    a = addUnsigned(a, AA);
    b = addUnsigned(b, BB);
    c = addUnsigned(c, CC);
    d = addUnsigned(d, DD);
  }

  return wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate cosine similarity between two embedding vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get current timestamp in milliseconds
 */
function now(): number {
  return Date.now();
}

/**
 * Convert days to milliseconds
 */
function daysToMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Create default user preferences
 */
function createDefaultPreferences(): UserPreferences {
  return {
    preferredLanguage: 'en',
    frameworks: [],
    codeStyle: {
      indentation: 'spaces',
      indentSize: 2,
      semicolons: true,
      quotes: 'single',
      trailingComma: true,
      maxLineLength: 100,
    },
    responseLength: 'detailed',
    lastUpdated: now(),
    confidenceScores: {
      preferredLanguage: 0,
      frameworks: 0,
      codeStyle: 0,
      responseLength: 0,
    },
  };
}

/**
 * Create a default project profile
 */
function createDefaultProfile(workingDirectory: string): ProjectProfile {
  const projectKey = md5(workingDirectory.toLowerCase().replace(/\\/g, '/'));
  const projectName = workingDirectory.split(/[\\/]/).pop() || 'Unknown Project';

  return {
    projectKey,
    workingDirectory,
    name: projectName,
    createdAt: now(),
    updatedAt: now(),
    memories: [],
    preferences: createDefaultPreferences(),
    ragContext: {
      filePatterns: [],
      importantFiles: [],
      techStack: [],
      projectType: 'unknown',
    },
    stats: {
      totalInteractions: 0,
      totalMemories: 0,
      lastPruned: 0,
      lastClustered: 0,
    },
  };
}

// =============================================================================
// Storage Keys
// =============================================================================

const STORAGE_PREFIX = 'memory-manager';
const PROFILES_KEY = `${STORAGE_PREFIX}:profiles`;
// Reserved for future use: const CURRENT_PROFILE_KEY = `${STORAGE_PREFIX}:current-profile`;

// =============================================================================
// Feature 1: Memory Pruning
// =============================================================================

/**
 * Prune old memories based on age, score, and hit count
 * Delete memories where: age > 30 days AND score < 0.3 AND hitCount < 2
 */
export function pruneOldMemories(
  memories: MemoryEntry[],
  config: PruneConfig = { maxAgeDays: 30, minScore: 0.3, minHitCount: 2 },
): { kept: MemoryEntry[]; pruned: MemoryEntry[] } {
  const currentTime = now();
  const maxAgeMs = daysToMs(config.maxAgeDays);

  const kept: MemoryEntry[] = [];
  const pruned: MemoryEntry[] = [];

  for (const memory of memories) {
    const age = currentTime - memory.createdAt;
    const isOld = age > maxAgeMs;
    const isLowScore = memory.score < config.minScore;
    const isLowHits = memory.hitCount < config.minHitCount;

    // Prune only if ALL conditions are met (AND logic)
    if (isOld && isLowScore && isLowHits) {
      pruned.push(memory);
    } else {
      kept.push(memory);
    }
  }

  return { kept, pruned };
}

// =============================================================================
// Feature 2: Memory Clustering
// =============================================================================

/**
 * Find clusters of similar memories and merge them
 * Similarity threshold: cosine > 0.9
 */
export function clusterAndMerge(
  memories: MemoryEntry[],
  similarityThreshold: number = 0.9,
): ClusterMergeResult {
  if (memories.length < 2) {
    return {
      clustersFound: 0,
      memoriesMerged: 0,
      newMemories: [...memories],
    };
  }

  // Track which memories have been merged
  const merged = new Set<string>();
  const clusters: MemoryEntry[][] = [];

  // Find clusters using greedy approach
  for (let i = 0; i < memories.length; i++) {
    if (merged.has(memories[i].id)) continue;

    const cluster: MemoryEntry[] = [memories[i]];
    merged.add(memories[i].id);

    for (let j = i + 1; j < memories.length; j++) {
      if (merged.has(memories[j].id)) continue;

      const similarity = cosineSimilarity(memories[i].embedding, memories[j].embedding);

      if (similarity >= similarityThreshold) {
        cluster.push(memories[j]);
        merged.add(memories[j].id);
      }
    }

    clusters.push(cluster);
  }

  // Merge clusters into single memories
  const newMemories: MemoryEntry[] = [];
  let memoriesMerged = 0;
  let clustersFound = 0;

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      // No merge needed
      newMemories.push(cluster[0]);
    } else {
      // Merge cluster into single memory
      clustersFound++;
      memoriesMerged += cluster.length;

      const merged = mergeMemoryCluster(cluster);
      newMemories.push(merged);
    }
  }

  return {
    clustersFound,
    memoriesMerged,
    newMemories,
  };
}

/**
 * Merge a cluster of similar memories into a single memory
 */
function mergeMemoryCluster(cluster: MemoryEntry[]): MemoryEntry {
  // Sort by score to get the best one as primary
  const sorted = [...cluster].sort((a, b) => b.score - a.score);
  const primary = sorted[0];

  // Combine all unique tags
  const allTags = new Set<string>();
  for (const mem of cluster) {
    mem.tags.forEach((tag) => allTags.add(tag));
  }

  // Average the embeddings
  const embeddingLength = primary.embedding.length;
  const avgEmbedding = new Array(embeddingLength).fill(0);

  for (const mem of cluster) {
    for (let i = 0; i < embeddingLength; i++) {
      avgEmbedding[i] += mem.embedding[i] / cluster.length;
    }
  }

  // Sum hit counts
  const totalHitCount = cluster.reduce((sum, m) => sum + m.hitCount, 0);

  // Average scores
  const avgScore = cluster.reduce((sum, m) => sum + m.score, 0) / cluster.length;

  // Merge content (keep primary, note merge count)
  const mergedContent =
    cluster.length > 1
      ? `${primary.content}\n[Merged from ${cluster.length} similar memories]`
      : primary.content;

  return {
    id: generateId(),
    content: mergedContent,
    embedding: avgEmbedding,
    score: avgScore,
    hitCount: totalHitCount,
    createdAt: Math.min(...cluster.map((m) => m.createdAt)),
    updatedAt: now(),
    tags: Array.from(allTags),
    type: primary.type,
    agent: primary.agent,
    multiModal: primary.multiModal,
  };
}

// =============================================================================
// Feature 3: User Preferences Extraction
// =============================================================================

/** Patterns for extracting preferences from interactions */
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  pl: [/\b(prosz[eę]|dzi[eę]kuj[eę]|czy|jest|nie|tak|mam|chc[eę])\b/i],
  en: [/\b(please|thanks?|yes|no|the|is|are|can|will|should)\b/i],
  de: [/\b(bitte|danke|ja|nein|ist|sind|kann|werden)\b/i],
  es: [/\b(por favor|gracias|s[ií]|no|es|son|puede)\b/i],
  fr: [/\b(s'il vous pla[iî]t|merci|oui|non|est|sont|peut)\b/i],
};

const FRAMEWORK_PATTERNS: Record<string, RegExp[]> = {
  React: [/\breact\b/i, /\buseState\b/, /\buseEffect\b/, /\bjsx\b/i],
  Vue: [/\bvue\b/i, /\bvuex\b/i, /\bpinia\b/i],
  Angular: [/\bangular\b/i, /\b@Component\b/, /\bngModule\b/i],
  Svelte: [/\bsvelte\b/i, /\bsveltekit\b/i],
  Next: [/\bnext\.?js\b/i, /\bgetServerSideProps\b/],
  Tauri: [/\btauri\b/i, /\binvoke\b.*tauri/i],
  Zustand: [/\bzustand\b/i, /\bcreate\(\)/],
  TanStack: [/\btanstack\b/i, /\breact.query\b/i, /\buseQuery\b/],
  Express: [/\bexpress\b/i, /\bapp\.get\b/],
  FastAPI: [/\bfastapi\b/i, /\b@app\.(get|post)\b/],
  Django: [/\bdjango\b/i, /\bfrom django\b/],
};

const CODE_STYLE_PATTERNS = {
  tabs: /^\t+/m,
  spaces2: /^ {2}[^ ]/m,
  spaces4: /^ {4}[^ ]/m,
  semicolons: /;\s*$/m,
  noSemicolons: /[^;]\s*$/m,
  singleQuotes: /'/,
  doubleQuotes: /"/,
  trailingComma: /,\s*[\]}]/,
};

const RESPONSE_LENGTH_PATTERNS = {
  concise: [/\b(short|brief|concise|quick|tl;?dr)\b/i],
  verbose: [/\b(detailed|explain|verbose|comprehensive|thorough)\b/i],
};

/**
 * Extract user preferences from interaction text
 * Updates incrementally with confidence scoring
 */
export function extractPreferences(
  text: string,
  existingPrefs: UserPreferences = createDefaultPreferences(),
): UserPreferences {
  const newPrefs = { ...existingPrefs, lastUpdated: now() };
  const confidenceIncrement = 0.1;
  const maxConfidence = 1.0;

  // 1. Detect language
  for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        if (newPrefs.preferredLanguage !== lang) {
          // Increment confidence or switch if new language has higher confidence
          const currentConfidence = newPrefs.confidenceScores.preferredLanguage;
          if (currentConfidence < 0.5 || lang === newPrefs.preferredLanguage) {
            newPrefs.preferredLanguage = lang;
          }
        }
        newPrefs.confidenceScores.preferredLanguage = Math.min(
          newPrefs.confidenceScores.preferredLanguage + confidenceIncrement,
          maxConfidence,
        );
        break;
      }
    }
  }

  // 2. Detect frameworks
  for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        if (!newPrefs.frameworks.includes(framework)) {
          newPrefs.frameworks.push(framework);
        }
        newPrefs.confidenceScores.frameworks = Math.min(
          newPrefs.confidenceScores.frameworks + confidenceIncrement,
          maxConfidence,
        );
        break;
      }
    }
  }

  // 3. Detect code style
  if (CODE_STYLE_PATTERNS.tabs.test(text)) {
    newPrefs.codeStyle.indentation = 'tabs';
    newPrefs.confidenceScores.codeStyle = Math.min(
      newPrefs.confidenceScores.codeStyle + confidenceIncrement,
      maxConfidence,
    );
  } else if (CODE_STYLE_PATTERNS.spaces4.test(text)) {
    newPrefs.codeStyle.indentation = 'spaces';
    newPrefs.codeStyle.indentSize = 4;
    newPrefs.confidenceScores.codeStyle = Math.min(
      newPrefs.confidenceScores.codeStyle + confidenceIncrement,
      maxConfidence,
    );
  } else if (CODE_STYLE_PATTERNS.spaces2.test(text)) {
    newPrefs.codeStyle.indentation = 'spaces';
    newPrefs.codeStyle.indentSize = 2;
    newPrefs.confidenceScores.codeStyle = Math.min(
      newPrefs.confidenceScores.codeStyle + confidenceIncrement,
      maxConfidence,
    );
  }

  // Detect semicolons preference
  const hasSemicolons = CODE_STYLE_PATTERNS.semicolons.test(text);
  const hasNoSemicolons = CODE_STYLE_PATTERNS.noSemicolons.test(text);
  if (hasSemicolons && !hasNoSemicolons) {
    newPrefs.codeStyle.semicolons = true;
  } else if (!hasSemicolons && hasNoSemicolons) {
    newPrefs.codeStyle.semicolons = false;
  }

  // Detect quote style
  const singleQuoteCount = (text.match(/'/g) || []).length;
  const doubleQuoteCount = (text.match(/"/g) || []).length;
  if (singleQuoteCount > doubleQuoteCount * 1.5) {
    newPrefs.codeStyle.quotes = 'single';
  } else if (doubleQuoteCount > singleQuoteCount * 1.5) {
    newPrefs.codeStyle.quotes = 'double';
  }

  // Detect trailing comma
  if (CODE_STYLE_PATTERNS.trailingComma.test(text)) {
    newPrefs.codeStyle.trailingComma = true;
  }

  // 4. Detect response length preference
  for (const pattern of RESPONSE_LENGTH_PATTERNS.concise) {
    if (pattern.test(text)) {
      newPrefs.responseLength = 'concise';
      newPrefs.confidenceScores.responseLength = Math.min(
        newPrefs.confidenceScores.responseLength + confidenceIncrement,
        maxConfidence,
      );
      break;
    }
  }
  for (const pattern of RESPONSE_LENGTH_PATTERNS.verbose) {
    if (pattern.test(text)) {
      newPrefs.responseLength = 'verbose';
      newPrefs.confidenceScores.responseLength = Math.min(
        newPrefs.confidenceScores.responseLength + confidenceIncrement,
        maxConfidence,
      );
      break;
    }
  }

  return newPrefs;
}

// =============================================================================
// Feature 4: Multi-Modal Placeholders
// =============================================================================

/**
 * Create a text embedding placeholder
 */
export function createTextEmbedding(
  embedding: number[],
  source?: string,
  model?: string,
): MultiModalEmbedding {
  return {
    type: 'text',
    embedding,
    metadata: {
      source,
      dimensions: embedding.length,
      model,
      createdAt: now(),
    },
  };
}

/**
 * Create an image embedding placeholder (for future use)
 */
export function createImageEmbedding(
  embedding: number[],
  mimeType: string,
  originalSize: { width: number; height: number },
  source?: string,
  model?: string,
): MultiModalEmbedding {
  return {
    type: 'image',
    embedding,
    metadata: {
      source,
      dimensions: embedding.length,
      model,
      createdAt: now(),
      mimeType,
      originalSize,
    },
  };
}

/**
 * Check if embedding is image type
 */
export function isImageEmbedding(embedding: MultiModalEmbedding): boolean {
  return embedding.type === 'image';
}

/**
 * Check if embedding is text type
 */
export function isTextEmbedding(embedding: MultiModalEmbedding): boolean {
  return embedding.type === 'text';
}

// =============================================================================
// Feature 5: Per-Project Profiles
// =============================================================================

/** In-memory cache of profiles */
const profileCache = new Map<string, ProjectProfile>();

/**
 * Generate project key from working directory
 */
export function generateProjectKey(workingDirectory: string): string {
  return md5(workingDirectory.toLowerCase().replace(/\\/g, '/'));
}

/**
 * Load all profiles from localStorage
 */
function loadProfiles(): Map<string, ProjectProfile> {
  try {
    const stored = localStorage.getItem(PROFILES_KEY);
    if (stored) {
      const profiles = JSON.parse(stored) as Record<string, ProjectProfile>;
      return new Map(Object.entries(profiles));
    }
  } catch (err) {
    console.error('[MemoryManager] Failed to load profiles:', err);
  }
  return new Map();
}

/**
 * Save all profiles to localStorage
 */
function saveProfiles(profiles: Map<string, ProjectProfile>): void {
  try {
    const obj = Object.fromEntries(profiles);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(obj));
  } catch (err) {
    console.error('[MemoryManager] Failed to save profiles:', err);
  }
}

/**
 * Get or create a project profile for the given working directory
 */
export function getProjectProfile(workingDirectory: string): ProjectProfile {
  const projectKey = generateProjectKey(workingDirectory);

  // Check cache first
  if (profileCache.has(projectKey)) {
    return profileCache.get(projectKey)!;
  }

  // Load from storage
  const profiles = loadProfiles();

  if (profiles.has(projectKey)) {
    const profile = profiles.get(projectKey)!;
    profileCache.set(projectKey, profile);
    return profile;
  }

  // Create new profile
  const newProfile = createDefaultProfile(workingDirectory);
  profiles.set(projectKey, newProfile);
  saveProfiles(profiles);
  profileCache.set(projectKey, newProfile);

  return newProfile;
}

/**
 * Update a project profile
 */
export function updateProjectProfile(profile: ProjectProfile): void {
  profile.updatedAt = now();
  profile.stats.totalMemories = profile.memories.length;

  const profiles = loadProfiles();
  profiles.set(profile.projectKey, profile);
  saveProfiles(profiles);
  profileCache.set(profile.projectKey, profile);
}

/**
 * Add a memory to a project profile
 */
export function addMemoryToProfile(
  workingDirectory: string,
  memory: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>,
): MemoryEntry {
  const profile = getProjectProfile(workingDirectory);

  const newMemory: MemoryEntry = {
    ...memory,
    id: generateId(),
    createdAt: now(),
    updatedAt: now(),
  };

  profile.memories.push(newMemory);
  profile.stats.totalInteractions++;
  updateProjectProfile(profile);

  return newMemory;
}

/**
 * Prune memories in a project profile
 */
export function pruneProjectMemories(
  workingDirectory: string,
  config?: PruneConfig,
): { kept: number; pruned: number } {
  const profile = getProjectProfile(workingDirectory);
  const result = pruneOldMemories(profile.memories, config);

  profile.memories = result.kept;
  profile.stats.lastPruned = now();
  updateProjectProfile(profile);

  return {
    kept: result.kept.length,
    pruned: result.pruned.length,
  };
}

/**
 * Cluster and merge memories in a project profile
 */
export function clusterProjectMemories(
  workingDirectory: string,
  similarityThreshold?: number,
): ClusterMergeResult {
  const profile = getProjectProfile(workingDirectory);
  const result = clusterAndMerge(profile.memories, similarityThreshold);

  profile.memories = result.newMemories;
  profile.stats.lastClustered = now();
  updateProjectProfile(profile);

  return result;
}

/**
 * Update preferences for a project profile based on interaction
 */
export function updateProjectPreferences(
  workingDirectory: string,
  interactionText: string,
): UserPreferences {
  const profile = getProjectProfile(workingDirectory);
  profile.preferences = extractPreferences(interactionText, profile.preferences);
  updateProjectProfile(profile);

  return profile.preferences;
}

/**
 * Get all project profiles
 */
export function getAllProfiles(): ProjectProfile[] {
  const profiles = loadProfiles();
  return Array.from(profiles.values());
}

/**
 * Delete a project profile
 */
export function deleteProjectProfile(workingDirectory: string): boolean {
  const projectKey = generateProjectKey(workingDirectory);
  const profiles = loadProfiles();

  if (profiles.has(projectKey)) {
    profiles.delete(projectKey);
    saveProfiles(profiles);
    profileCache.delete(projectKey);
    return true;
  }

  return false;
}

/**
 * Search memories across all projects
 */
export function searchMemoriesGlobal(
  query: string,
  limit: number = 10,
): Array<{ memory: MemoryEntry; profile: ProjectProfile }> {
  const profiles = loadProfiles();
  const results: Array<{ memory: MemoryEntry; profile: ProjectProfile; relevance: number }> = [];

  const queryLower = query.toLowerCase();

  for (const profile of Array.from(profiles.values())) {
    for (const memory of profile.memories) {
      const contentMatch = memory.content.toLowerCase().includes(queryLower);
      const tagMatch = memory.tags.some((tag) => tag.toLowerCase().includes(queryLower));

      if (contentMatch || tagMatch) {
        results.push({
          memory,
          profile,
          relevance: memory.score * (contentMatch ? 1.5 : 1) * (tagMatch ? 1.2 : 1),
        });
      }
    }
  }

  // Sort by relevance and return top results
  results.sort((a, b) => b.relevance - a.relevance);
  return results.slice(0, limit).map(({ memory, profile }) => ({ memory, profile }));
}

/**
 * Increment hit count for a memory
 */
export function recordMemoryHit(workingDirectory: string, memoryId: string): void {
  const profile = getProjectProfile(workingDirectory);
  const memory = profile.memories.find((m) => m.id === memoryId);

  if (memory) {
    memory.hitCount++;
    memory.updatedAt = now();
    updateProjectProfile(profile);
  }
}

// =============================================================================
// Exports Summary
// =============================================================================

export {
  // Types are exported above
  // Feature 1: Memory Pruning
  // pruneOldMemories - exported above

  // Feature 2: Memory Clustering
  // clusterAndMerge - exported above

  // Feature 3: User Preferences
  // extractPreferences - exported above

  // Feature 4: Multi-Modal
  // createTextEmbedding, createImageEmbedding, isImageEmbedding, isTextEmbedding - exported above

  // Feature 5: Per-Project Profiles
  // getProjectProfile, updateProjectProfile, generateProjectKey - exported above

  // Helper exports
  cosineSimilarity,
  md5 as hashMd5,
};
