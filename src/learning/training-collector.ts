/**
 * @fileoverview Training Data Collector
 * Collects and formats interactions for fine-tuning Ollama models
 *
 * @description
 * Gathers user-AI interactions in JSONL format suitable for:
 * - Instruction tuning (Alpaca format)
 * - Conversational fine-tuning (ShareGPT format)
 * - Preference learning (DPO format)
 *
 * @module learning/training-collector
 */

import { appendFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

/** @type {string} Training data directory */
const TRAINING_DIR = join(REPO_ROOT, 'data', 'training');

/** @type {number} Minimum interaction length to collect */
const MIN_CONTENT_LENGTH = 50;

/** @type {number} Maximum examples before rotation */
const MAX_EXAMPLES_PER_FILE = 10000;

/**
 * @typedef {Object} InstructionExample
 * @property {string} instruction - User's instruction/question
 * @property {string} input - Additional context (optional)
 * @property {string} output - AI's response
 * @property {string} [system] - System prompt used
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} ConversationExample
 * @property {Array<{role: string, content: string}>} messages - Conversation messages
 * @property {string} [source] - Source identifier
 * @property {number} [timestamp] - Unix timestamp
 */

/**
 * @typedef {Object} PreferenceExample
 * @property {string} prompt - User prompt
 * @property {string} chosen - Preferred response
 * @property {string} rejected - Non-preferred response
 */

/**
 * Ensures training directory exists
 * @returns {Promise<void>}
 */
async function ensureTrainingDir() {
  await mkdir(TRAINING_DIR, { recursive: true });
}

/**
 * Gets the current training file path
 * @param {string} format - Format type (instruction, conversation, preference)
 * @returns {string} File path
 */
function getTrainingFilePath(format) {
  const date = new Date().toISOString().slice(0, 10);
  return join(TRAINING_DIR, `${format}-${date}.jsonl`);
}

/**
 * Collects an instruction-style example (Alpaca format)
 * Used for fine-tuning on task completion
 *
 * @param {InstructionExample} example - The example to collect
 * @returns {Promise<{success: boolean, path: string}>}
 *
 * @example
 * await collectInstruction({
 *   instruction: "Write a function to sort an array",
 *   input: "Array of numbers",
 *   output: "function sort(arr) { return arr.sort((a,b) => a-b); }"
 * });
 */
export async function collectInstruction(example) {
  const { instruction, input = '', output, system, metadata = {} } = example;

  // Validate content length
  if (instruction.length < MIN_CONTENT_LENGTH || output.length < MIN_CONTENT_LENGTH) {
    return { success: false, path: null, reason: 'Content too short' };
  }

  await ensureTrainingDir();
  const filePath = getTrainingFilePath('instruction');

  const record = {
    instruction: instruction.trim(),
    input: input.trim(),
    output: output.trim(),
    ...(system && { system: system.trim() }),
    metadata: {
      ...metadata,
      collected_at: new Date().toISOString(),
      source: 'claude-cli'
    }
  };

  await appendFile(filePath, JSON.stringify(record) + '\n', 'utf8');

  return { success: true, path: filePath };
}

/**
 * Collects a conversation-style example (ShareGPT format)
 * Used for fine-tuning on multi-turn dialogue
 *
 * @param {ConversationExample} example - The conversation to collect
 * @returns {Promise<{success: boolean, path: string}>}
 *
 * @example
 * await collectConversation({
 *   messages: [
 *     { role: 'user', content: 'What is React?' },
 *     { role: 'assistant', content: 'React is a JavaScript library...' },
 *     { role: 'user', content: 'How do I use hooks?' },
 *     { role: 'assistant', content: 'Hooks are functions that...' }
 *   ]
 * });
 */
export async function collectConversation(example) {
  const { messages, source = 'claude-cli' } = example;

  // Validate conversation
  if (!messages || messages.length < 2) {
    return { success: false, path: null, reason: 'Conversation too short' };
  }

  // Check total content length
  const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalLength < MIN_CONTENT_LENGTH * 2) {
    return { success: false, path: null, reason: 'Content too short' };
  }

  await ensureTrainingDir();
  const filePath = getTrainingFilePath('conversation');

  const record = {
    messages: messages.map(m => ({
      role: m.role,
      content: m.content.trim()
    })),
    source,
    timestamp: Date.now(),
    collected_at: new Date().toISOString()
  };

  await appendFile(filePath, JSON.stringify(record) + '\n', 'utf8');

  return { success: true, path: filePath };
}

/**
 * Collects a preference example (DPO format)
 * Used for RLHF-style preference learning
 *
 * @param {PreferenceExample} example - The preference pair to collect
 * @returns {Promise<{success: boolean, path: string}>}
 *
 * @example
 * await collectPreference({
 *   prompt: "Explain closures in JavaScript",
 *   chosen: "A closure is a function that remembers its scope...",
 *   rejected: "Closures are things in JavaScript."
 * });
 */
export async function collectPreference(example) {
  const { prompt, chosen, rejected } = example;

  if (!prompt || !chosen || !rejected) {
    return { success: false, path: null, reason: 'Missing fields' };
  }

  await ensureTrainingDir();
  const filePath = getTrainingFilePath('preference');

  const record = {
    prompt: prompt.trim(),
    chosen: chosen.trim(),
    rejected: rejected.trim(),
    collected_at: new Date().toISOString()
  };

  await appendFile(filePath, JSON.stringify(record) + '\n', 'utf8');

  return { success: true, path: filePath };
}

/**
 * Extracts training data from swarm memory archives
 * Parses existing memory files and converts to training format
 *
 * @param {string} archivePath - Path to swarm archive file
 * @returns {Promise<{instructions: number, conversations: number}>}
 */
export async function extractFromArchive(archivePath) {
  const content = await readFile(archivePath, 'utf8');
  let instructions = 0;
  let conversations = 0;

  // Extract prompt and final answer sections
  const promptMatch = content.match(/## Prompt\n\n([\s\S]*?)(?=\n## )/);
  const answerMatch = content.match(/## Synthesis\n\n([\s\S]*?)(?=\n## )/);

  if (promptMatch && answerMatch) {
    const instruction = promptMatch[1].trim();
    const output = answerMatch[1].trim();

    if (instruction && output && instruction !== '_No prompt provided_') {
      await collectInstruction({ instruction, output });
      instructions++;
    }
  }

  // Extract agent responses as conversation turns
  const agentSection = content.match(/## Agent Responses\n\n([\s\S]*?)(?=\n## )/);
  if (agentSection && promptMatch) {
    const messages = [{ role: 'user', content: promptMatch[1].trim() }];

    // Parse each agent response
    const agentBlocks = agentSection[1].split(/### /);
    for (const block of agentBlocks) {
      if (!block.trim()) continue;
      const responseMatch = block.match(/\*\*Model\*\*: .+\n\n([\s\S]*)/);
      if (responseMatch && responseMatch[1].trim() !== '_No response_') {
        messages.push({ role: 'assistant', content: responseMatch[1].trim() });
      }
    }

    if (messages.length >= 2) {
      await collectConversation({ messages });
      conversations++;
    }
  }

  return { instructions, conversations };
}

/**
 * Gets statistics about collected training data
 *
 * @returns {Promise<{
 *   instruction: {files: number, examples: number, size: string},
 *   conversation: {files: number, examples: number, size: string},
 *   preference: {files: number, examples: number, size: string}
 * }>}
 */
export async function getTrainingStats() {
  await ensureTrainingDir();

  const { readdir } = await import('node:fs/promises');
  const files = await readdir(TRAINING_DIR);

  const stats = {
    instruction: { files: 0, examples: 0, size: 0 },
    conversation: { files: 0, examples: 0, size: 0 },
    preference: { files: 0, examples: 0, size: 0 }
  };

  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue;

    const format = file.split('-')[0];
    if (!stats[format]) continue;

    const filePath = join(TRAINING_DIR, file);
    const fileStat = await stat(filePath);
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);

    stats[format].files++;
    stats[format].examples += lines.length;
    stats[format].size += fileStat.size;
  }

  // Format sizes
  for (const format of Object.keys(stats)) {
    stats[format].size = `${(stats[format].size / 1024).toFixed(2)} KB`;
  }

  return stats;
}

/**
 * Merges all training files into single export files
 * Prepares data for fine-tuning pipeline
 *
 * @param {string} [outputDir] - Output directory
 * @returns {Promise<{path: string, formats: string[]}>}
 */
export async function exportForFineTuning(outputDir = join(TRAINING_DIR, 'export')) {
  await mkdir(outputDir, { recursive: true });

  const { readdir } = await import('node:fs/promises');
  const files = await readdir(TRAINING_DIR);

  const merged = {
    instruction: [],
    conversation: [],
    preference: []
  };

  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue;

    const format = file.split('-')[0];
    if (!merged[format]) continue;

    const content = await readFile(join(TRAINING_DIR, file), 'utf8');
    const lines = content.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        merged[format].push(JSON.parse(line));
      } catch {
        // Skip invalid lines
      }
    }
  }

  const exportedFormats = [];

  // Export each format
  for (const [format, examples] of Object.entries(merged)) {
    if (examples.length === 0) continue;

    const exportPath = join(outputDir, `${format}-merged.jsonl`);
    const content = examples.map(e => JSON.stringify(e)).join('\n') + '\n';
    await writeFile(exportPath, content, 'utf8');
    exportedFormats.push(format);
  }

  return { path: outputDir, formats: exportedFormats };
}

export default {
  collectInstruction,
  collectConversation,
  collectPreference,
  extractFromArchive,
  getTrainingStats,
  exportForFineTuning,
  TRAINING_DIR
};
