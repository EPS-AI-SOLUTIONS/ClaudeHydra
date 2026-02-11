/**
 * Block 3: Training Data Quality System
 *
 * Features:
 * 1. SimHash deduplication engine (64-bit fingerprint)
 * 2. Quality scoring (0-100)
 * 3. Content filter with keyword patterns
 * 4. Language detection (pl/en/code)
 * 5. Instruction extraction from prompts
 */

// ============================================================================
// Types
// ============================================================================

export interface QualityScore {
  total: number; // 0-100
  responseLength: number; // 0-30
  codePresence: number; // 0-20
  formatting: number; // 0-20
  keywordDensity: number; // 0-30
  breakdown: QualityBreakdown;
}

export interface QualityBreakdown {
  wordCount: number;
  hasCodeBlocks: boolean;
  hasLists: boolean;
  hasHeaders: boolean;
  technicalKeywords: number;
  actionableKeywords: number;
}

export type DetectedLanguage = 'pl' | 'en' | 'code' | 'mixed';

export interface LanguageAnalysis {
  primary: DetectedLanguage;
  confidence: number;
  scores: {
    polish: number;
    english: number;
    code: number;
  };
}

export interface ContentFilterResult {
  isLowQuality: boolean;
  flags: ContentFlag[];
  severity: 'none' | 'low' | 'medium' | 'high';
}

export interface ContentFlag {
  type: string;
  pattern: string;
  position: number;
}

export interface InstructionExtraction {
  instruction: string;
  verb: string | null;
  subject: string | null;
  fullPhrase: string;
}

// ============================================================================
// 1. SimHash Deduplication Engine (64-bit)
// ============================================================================

/**
 * Tokenize text into n-grams (shingles) for SimHash
 */
function tokenize(text: string, n: number = 3): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const tokens: string[] = [];

  for (let i = 0; i <= normalized.length - n; i++) {
    tokens.push(normalized.substring(i, i + n));
  }

  return tokens;
}

/**
 * Simple hash function for tokens (FNV-1a inspired)
 * Returns a BigInt for 64-bit operations
 */
function hashToken(token: string): bigint {
  let hash = BigInt('14695981039346656037'); // FNV offset basis
  const prime = BigInt('1099511628211'); // FNV prime

  for (let i = 0; i < token.length; i++) {
    hash ^= BigInt(token.charCodeAt(i));
    hash = (hash * prime) & BigInt('0xFFFFFFFFFFFFFFFF'); // Keep 64-bit
  }

  return hash;
}

/**
 * Calculate SimHash fingerprint (64-bit)
 * @param text - Input text to fingerprint
 * @returns 64-bit SimHash as BigInt
 */
export function simHash(text: string): bigint {
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return BigInt(0);
  }

  // Initialize 64 weight counters
  const weights: number[] = new Array(64).fill(0);

  // Process each token
  for (const token of tokens) {
    const hash = hashToken(token);

    // Update weights based on hash bits
    for (let i = 0; i < 64; i++) {
      const bit = (hash >> BigInt(i)) & BigInt(1);
      weights[i] += bit === BigInt(1) ? 1 : -1;
    }
  }

  // Build fingerprint from weights
  let fingerprint = BigInt(0);
  for (let i = 0; i < 64; i++) {
    if (weights[i] > 0) {
      fingerprint |= BigInt(1) << BigInt(i);
    }
  }

  return fingerprint;
}

/**
 * Calculate Hamming distance between two 64-bit fingerprints
 */
function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let distance = 0;

  while (xor > 0) {
    distance += Number(xor & BigInt(1));
    xor >>= BigInt(1);
  }

  return distance;
}

/**
 * Calculate similarity between two SimHash fingerprints (0-1)
 */
export function simHashSimilarity(hash1: bigint, hash2: bigint): number {
  const distance = hammingDistance(hash1, hash2);
  return (64 - distance) / 64;
}

/**
 * Check if two texts are near-duplicates (>85% similarity by default)
 * @param text1 - First text
 * @param text2 - Second text
 * @param threshold - Similarity threshold (default 0.85)
 * @returns true if texts are near-duplicates
 */
export function isDuplicate(text1: string, text2: string, threshold: number = 0.85): boolean {
  const hash1 = simHash(text1);
  const hash2 = simHash(text2);
  const similarity = simHashSimilarity(hash1, hash2);

  return similarity >= threshold;
}

/**
 * Batch deduplication - returns indices of unique samples
 */
export function deduplicateBatch(texts: string[], threshold: number = 0.85): number[] {
  const hashes: bigint[] = texts.map(simHash);
  const uniqueIndices: number[] = [];

  for (let i = 0; i < texts.length; i++) {
    let isDupe = false;

    for (const uniqueIdx of uniqueIndices) {
      if (simHashSimilarity(hashes[i], hashes[uniqueIdx]) >= threshold) {
        isDupe = true;
        break;
      }
    }

    if (!isDupe) {
      uniqueIndices.push(i);
    }
  }

  return uniqueIndices;
}

// ============================================================================
// 2. Quality Scoring (0-100)
// ============================================================================

// Technical keywords that indicate quality content
const TECHNICAL_KEYWORDS = [
  'function',
  'class',
  'interface',
  'type',
  'const',
  'let',
  'var',
  'async',
  'await',
  'promise',
  'return',
  'export',
  'import',
  'api',
  'endpoint',
  'database',
  'query',
  'schema',
  'model',
  'component',
  'hook',
  'state',
  'props',
  'render',
  'effect',
  'algorithm',
  'complexity',
  'performance',
  'optimization',
  'test',
  'mock',
  'assert',
  'expect',
  'describe',
  'it',
  'error',
  'exception',
  'debug',
  'log',
  'trace',
  'security',
  'authentication',
  'authorization',
  'encryption',
];

// Actionable keywords that indicate useful instructions
const ACTIONABLE_KEYWORDS = [
  'create',
  'implement',
  'build',
  'add',
  'remove',
  'delete',
  'update',
  'fix',
  'refactor',
  'optimize',
  'improve',
  'enhance',
  'modify',
  'explain',
  'describe',
  'analyze',
  'review',
  'check',
  'verify',
  'configure',
  'setup',
  'install',
  'deploy',
  'test',
  'debug',
  'convert',
  'transform',
  'migrate',
  'integrate',
  'connect',
];

/**
 * Calculate quality score for a training sample
 * @param response - The response/answer text
 * @param prompt - Optional prompt text for context
 * @returns Quality score breakdown (0-100 total)
 */
export function scoreQuality(response: string, prompt?: string): QualityScore {
  const text = response.trim();
  const combinedText = prompt ? `${prompt} ${text}` : text;

  // Calculate individual scores
  const responseLength = scoreResponseLength(text);
  const codePresence = scoreCodePresence(text);
  const formatting = scoreFormatting(text);
  const keywordDensity = scoreKeywordDensity(combinedText);

  // Build breakdown
  const breakdown = buildBreakdown(text, combinedText);

  return {
    total: responseLength + codePresence + formatting + keywordDensity,
    responseLength,
    codePresence,
    formatting,
    keywordDensity,
    breakdown,
  };
}

/**
 * Score based on response length (0-30 points)
 * Optimal: 100-2000 words
 */
function scoreResponseLength(text: string): number {
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;

  if (wordCount < 10) return 0;
  if (wordCount < 30) return 5;
  if (wordCount < 50) return 10;
  if (wordCount < 100) return 15;
  if (wordCount < 200) return 20;
  if (wordCount < 500) return 25;
  if (wordCount <= 2000) return 30;
  if (wordCount <= 3000) return 25; // Slightly penalize very long
  return 20; // Penalize extremely long responses
}

/**
 * Score based on code presence (0-20 points)
 */
function scoreCodePresence(text: string): number {
  let score = 0;

  // Check for code blocks (markdown)
  const codeBlockCount = (text.match(/```[\s\S]*?```/g) || []).length;
  score += Math.min(codeBlockCount * 5, 10);

  // Check for inline code
  const inlineCodeCount = (text.match(/`[^`]+`/g) || []).length;
  score += Math.min(inlineCodeCount * 1, 5);

  // Check for code-like patterns (functions, arrows, etc.)
  const codePatterns = [
    /\w+\s*\([^)]*\)\s*[{=>]/g, // function calls/definitions
    /=>\s*[{(]/g, // arrow functions
    /\b(if|for|while|switch)\s*\(/g, // control structures
    /\b(const|let|var)\s+\w+/g, // variable declarations
  ];

  let patternScore = 0;
  for (const pattern of codePatterns) {
    if (pattern.test(text)) patternScore++;
  }
  score += Math.min(patternScore * 2, 5);

  return Math.min(score, 20);
}

/**
 * Score based on formatting quality (0-20 points)
 */
function scoreFormatting(text: string): number {
  let score = 0;

  // Headers (markdown)
  if (/^#{1,6}\s+.+/m.test(text)) score += 5;

  // Lists (bullet or numbered)
  if (/^[\s]*[-*+]\s+.+/m.test(text) || /^[\s]*\d+\.\s+.+/m.test(text)) score += 5;

  // Paragraphs (multiple line breaks indicating structure)
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length >= 2) score += 3;
  if (paragraphs.length >= 4) score += 2;

  // Bold/italic (emphasis)
  if (/\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_/.test(text)) score += 3;

  // Links
  if (/\[.+\]\(.+\)/.test(text)) score += 2;

  return Math.min(score, 20);
}

/**
 * Score based on keyword density (0-30 points)
 */
function scoreKeywordDensity(text: string): number {
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);
  const wordCount = words.length;

  if (wordCount === 0) return 0;

  // Count technical keywords
  let technicalCount = 0;
  for (const keyword of TECHNICAL_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = text.match(regex);
    technicalCount += matches ? matches.length : 0;
  }

  // Count actionable keywords
  let actionableCount = 0;
  for (const keyword of ACTIONABLE_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = text.match(regex);
    actionableCount += matches ? matches.length : 0;
  }

  // Calculate density scores
  const technicalDensity = technicalCount / wordCount;
  const actionableDensity = actionableCount / wordCount;

  // Score technical keywords (0-20)
  let technicalScore = 0;
  if (technicalDensity > 0.01) technicalScore = 5;
  if (technicalDensity > 0.02) technicalScore = 10;
  if (technicalDensity > 0.04) technicalScore = 15;
  if (technicalDensity > 0.06) technicalScore = 20;

  // Score actionable keywords (0-10)
  let actionableScore = 0;
  if (actionableDensity > 0.005) actionableScore = 3;
  if (actionableDensity > 0.01) actionableScore = 6;
  if (actionableDensity > 0.02) actionableScore = 10;

  return Math.min(technicalScore + actionableScore, 30);
}

/**
 * Build detailed breakdown of quality metrics
 */
function buildBreakdown(text: string, combinedText: string): QualityBreakdown {
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  let technicalCount = 0;
  for (const keyword of TECHNICAL_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = combinedText.match(regex);
    technicalCount += matches ? matches.length : 0;
  }

  let actionableCount = 0;
  for (const keyword of ACTIONABLE_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = combinedText.match(regex);
    actionableCount += matches ? matches.length : 0;
  }

  return {
    wordCount: words.length,
    hasCodeBlocks: /```[\s\S]*?```/.test(text),
    hasLists: /^[\s]*[-*+\d.]\s+.+/m.test(text),
    hasHeaders: /^#{1,6}\s+.+/m.test(text),
    technicalKeywords: technicalCount,
    actionableKeywords: actionableCount,
  };
}

// ============================================================================
// 3. Content Filter
// ============================================================================

// Low-quality content patterns
const LOW_QUALITY_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  // Placeholder/filler content
  { type: 'placeholder', pattern: /lorem ipsum|placeholder|todo:|fixme:|xxx|tbd/gi },

  // Spam patterns
  { type: 'spam', pattern: /click here|buy now|free money|winner|congratulations!/gi },

  // Low-effort responses
  { type: 'low_effort', pattern: /^(ok|yes|no|sure|thanks|idk|dunno|maybe)\.?$/gi },

  // Repetitive patterns
  { type: 'repetitive', pattern: /(.{10,})\1{2,}/gi },

  // Gibberish (random character sequences)
  {
    type: 'gibberish',
    pattern: /[a-z]{15,}(?![a-z]*(?:tion|ment|able|ible|ness|less|ship|ward|wise|like))/gi,
  },

  // Excessive punctuation
  { type: 'excessive_punctuation', pattern: /[!?]{4,}|\.{5,}/g },

  // Empty code blocks
  { type: 'empty_code', pattern: /```\s*```/g },

  // Generic unhelpful responses
  { type: 'unhelpful', pattern: /i (don't|cant|cannot) (help|assist|answer)/gi },

  // AI hallucination markers
  { type: 'hallucination_marker', pattern: /as an ai|i am an ai|i'm an ai language model/gi },
];

/**
 * Filter content for low-quality patterns
 * @param text - Text to analyze
 * @returns Filter result with flags and severity
 */
export function filterContent(text: string): ContentFilterResult {
  const flags: ContentFlag[] = [];

  for (const { type, pattern } of LOW_QUALITY_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      flags.push({
        type,
        pattern: match[0],
        position: match.index,
      });

      // Avoid infinite loops for global patterns
      if (!pattern.global) break;
    }
  }

  // Calculate severity
  let severity: ContentFilterResult['severity'] = 'none';
  if (flags.length > 0) severity = 'low';
  if (flags.length >= 3) severity = 'medium';
  if (flags.length >= 5 || flags.some((f) => f.type === 'spam' || f.type === 'gibberish')) {
    severity = 'high';
  }

  return {
    isLowQuality: flags.length > 0,
    flags,
    severity,
  };
}

// ============================================================================
// 4. Language Detection
// ============================================================================

// Polish-specific characters and patterns
const POLISH_CHARS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g;
const POLISH_PATTERNS = [
  /\b(jest|są|był|była|było|będzie|może|który|która|które|oraz|przez|jako|także|jednak|więc)\b/gi,
  /\b(nie|tak|bardzo|teraz|tutaj|zawsze|nigdy|często|rzadko)\b/gi,
  /\b(funkcja|metoda|klasa|obiekt|tablica|zmienna|stała|pętla|warunek)\b/gi, // Polish tech terms
];

// English patterns
const ENGLISH_PATTERNS = [
  /\b(the|is|are|was|were|will|can|which|that|this|with|from|have|has)\b/gi,
  /\b(function|class|interface|component|method|variable|constant|array|object)\b/gi,
  /\b(create|implement|build|update|delete|remove|add|fix|refactor)\b/gi,
];

// Code patterns
const CODE_PATTERNS = [
  /\b(const|let|var|function|class|interface|type|export|import|return)\b/g,
  /[{}[\]();]/g,
  /=>/g,
  /[<>]=?/g,
  /\b(async|await|Promise|void|null|undefined|true|false)\b/g,
  /[a-zA-Z_]\w*\s*\([^)]*\)/g, // Function calls
  /^\s*(\/\/|\/\*|#|--)/gm, // Comments
];

/**
 * Detect language of text (pl/en/code/mixed)
 * @param text - Text to analyze
 * @returns Language analysis with confidence
 */
export function detectLanguage(text: string): LanguageAnalysis {
  const totalChars = text.length;
  if (totalChars === 0) {
    return {
      primary: 'en',
      confidence: 0,
      scores: { polish: 0, english: 0, code: 0 },
    };
  }

  // Calculate Polish score
  let polishScore = 0;
  const polishChars = text.match(POLISH_CHARS);
  polishScore += polishChars ? (polishChars.length / totalChars) * 100 : 0;

  for (const pattern of POLISH_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    polishScore += matches ? matches.length * 3 : 0;
  }

  // Calculate English score
  let englishScore = 0;
  for (const pattern of ENGLISH_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    englishScore += matches ? matches.length * 2 : 0;
  }

  // Calculate Code score
  let codeScore = 0;
  for (const pattern of CODE_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    codeScore += matches ? matches.length * 4 : 0;
  }

  // Check for code blocks
  const codeBlocks = text.match(/```[\s\S]*?```/g);
  if (codeBlocks) {
    codeScore += (codeBlocks.join('').length / totalChars) * 50;
  }

  // Normalize scores
  const maxScore = Math.max(polishScore, englishScore, codeScore, 1);
  const normalizedPolish = (polishScore / maxScore) * 100;
  const normalizedEnglish = (englishScore / maxScore) * 100;
  const normalizedCode = (codeScore / maxScore) * 100;

  // Determine primary language
  let primary: DetectedLanguage;
  let confidence: number;

  if (normalizedCode > 60) {
    primary = 'code';
    confidence = normalizedCode;
  } else if (normalizedPolish > normalizedEnglish && normalizedPolish > 40) {
    primary = 'pl';
    confidence = normalizedPolish;
  } else if (normalizedEnglish > normalizedPolish && normalizedEnglish > 40) {
    primary = 'en';
    confidence = normalizedEnglish;
  } else {
    // Check if mixed
    const spread = Math.abs(normalizedPolish - normalizedEnglish);
    if (spread < 20 && (normalizedPolish > 20 || normalizedEnglish > 20)) {
      primary = 'mixed';
      confidence = Math.max(normalizedPolish, normalizedEnglish);
    } else {
      primary = normalizedEnglish >= normalizedPolish ? 'en' : 'pl';
      confidence = Math.max(normalizedPolish, normalizedEnglish);
    }
  }

  return {
    primary,
    confidence: Math.min(Math.round(confidence), 100),
    scores: {
      polish: Math.round(normalizedPolish),
      english: Math.round(normalizedEnglish),
      code: Math.round(normalizedCode),
    },
  };
}

// ============================================================================
// 5. Instruction Extraction
// ============================================================================

// Common instruction verbs (English and Polish)
const INSTRUCTION_VERBS_EN = [
  'create',
  'implement',
  'build',
  'make',
  'add',
  'write',
  'generate',
  'remove',
  'delete',
  'fix',
  'repair',
  'update',
  'modify',
  'change',
  'refactor',
  'optimize',
  'improve',
  'enhance',
  'simplify',
  'explain',
  'describe',
  'analyze',
  'review',
  'check',
  'verify',
  'validate',
  'find',
  'search',
  'locate',
  'get',
  'fetch',
  'retrieve',
  'list',
  'configure',
  'setup',
  'install',
  'deploy',
  'run',
  'execute',
  'test',
  'convert',
  'transform',
  'migrate',
  'import',
  'export',
  'show',
  'display',
  'print',
  'output',
  'return',
  'help',
  'assist',
  'guide',
  'teach',
  'demonstrate',
];

const INSTRUCTION_VERBS_PL = [
  'utwórz',
  'stwórz',
  'zaimplementuj',
  'zbuduj',
  'dodaj',
  'napisz',
  'wygeneruj',
  'usuń',
  'napraw',
  'zaktualizuj',
  'zmodyfikuj',
  'zmień',
  'zrefaktoryzuj',
  'zoptymalizuj',
  'ulepsz',
  'uprość',
  'wyjaśnij',
  'opisz',
  'przeanalizuj',
  'przejrzyj',
  'sprawdź',
  'zweryfikuj',
  'znajdź',
  'wyszukaj',
  'pobierz',
  'wylistuj',
  'skonfiguruj',
  'zainstaluj',
  'wdróż',
  'uruchom',
  'wykonaj',
  'przetestuj',
  'przekonwertuj',
  'przekształć',
  'zmigruj',
  'zaimportuj',
  'wyeksportuj',
  'pokaż',
  'wyświetl',
  'wydrukuj',
  'zwróć',
  'pomóż',
  'pomagaj',
  'naucz',
  'zademonstruj',
];

const ALL_VERBS = [...INSTRUCTION_VERBS_EN, ...INSTRUCTION_VERBS_PL];

/**
 * Extract key instruction from prompt (first verb phrase)
 * @param prompt - User prompt/instruction
 * @returns Extracted instruction details
 */
export function extractInstruction(prompt: string): InstructionExtraction {
  const normalized = prompt.trim();

  // Split into sentences
  const sentences = normalized
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) {
    return {
      instruction: normalized,
      verb: null,
      subject: null,
      fullPhrase: normalized,
    };
  }

  const firstSentence = sentences[0];
  const words = firstSentence.split(/\s+/);

  // Find the first verb
  let verbIndex = -1;
  let foundVerb: string | null = null;

  for (let i = 0; i < words.length && i < 10; i++) {
    const word = words[i].toLowerCase().replace(/[^a-ząćęłńóśźż]/gi, '');

    if (ALL_VERBS.some((v) => v.toLowerCase() === word)) {
      verbIndex = i;
      foundVerb = word;
      break;
    }
  }

  // If no verb found, try to identify imperative form
  if (verbIndex === -1 && words.length > 0) {
    const firstWord = words[0].toLowerCase();
    // Check if first word looks like a verb (ends with common verb suffixes)
    if (
      /^[a-z]+(e|ed|ing|ify|ize|ate)$/i.test(firstWord) ||
      /^[a-ząćęłńóśźż]+(uj|aj|ij|ej|ać|ić|yć)$/i.test(firstWord)
    ) {
      verbIndex = 0;
      foundVerb = firstWord;
    }
  }

  // Extract subject (words after verb up to preposition/conjunction or end)
  let subject: string | null = null;
  if (verbIndex >= 0 && verbIndex < words.length - 1) {
    const stopWords = [
      'to',
      'for',
      'with',
      'in',
      'on',
      'at',
      'from',
      'by',
      'that',
      'which',
      'do',
      'dla',
      'z',
      'w',
      'na',
      'od',
      'przez',
      'który',
      'która',
    ];
    const subjectWords: string[] = [];

    for (let i = verbIndex + 1; i < words.length && i < verbIndex + 6; i++) {
      const word = words[i].toLowerCase().replace(/[^a-ząćęłńóśźż]/gi, '');
      if (stopWords.includes(word)) break;
      subjectWords.push(words[i]);
    }

    if (subjectWords.length > 0) {
      subject = subjectWords.join(' ');
    }
  }

  // Build instruction summary
  let instruction: string;
  if (foundVerb && subject) {
    instruction = `${foundVerb} ${subject}`;
  } else if (foundVerb) {
    instruction = foundVerb;
  } else {
    // Extract first meaningful phrase (up to 5 words)
    instruction = words.slice(0, 5).join(' ');
  }

  return {
    instruction: instruction.toLowerCase(),
    verb: foundVerb,
    subject,
    fullPhrase: firstSentence,
  };
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Combined quality assessment for a training sample
 */
export interface SampleAssessment {
  quality: QualityScore;
  language: LanguageAnalysis;
  contentFilter: ContentFilterResult;
  instruction: InstructionExtraction;
  fingerprint: string; // hex representation of SimHash
  isAcceptable: boolean;
}

/**
 * Comprehensive assessment of a training sample
 */
export function assessSample(prompt: string, response: string): SampleAssessment {
  const quality = scoreQuality(response, prompt);
  const language = detectLanguage(`${prompt} ${response}`);
  const contentFilter = filterContent(`${prompt} ${response}`);
  const instruction = extractInstruction(prompt);
  const fingerprint = simHash(`${prompt} ${response}`).toString(16).padStart(16, '0');

  // Sample is acceptable if:
  // - Quality score >= 40
  // - Not high severity content filter
  // - Not gibberish language detection
  const isAcceptable =
    quality.total >= 40 && contentFilter.severity !== 'high' && language.confidence > 20;

  return {
    quality,
    language,
    contentFilter,
    instruction,
    fingerprint,
    isAcceptable,
  };
}
