/**
 * @fileoverview Gemini Client - Direct API wrapper for Google Gemini
 *
 * IMPORTANT: Temperature is HARDCODED to 1.0 and cannot be changed.
 * Any temperature passed in options is ignored.
 *
 * @module hydra/providers/gemini-client
 */

import { GEMINI_MODELS, GEMINI_TEMPERATURE } from './gemini-models.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!key) {
    throw new Error('[GeminiClient] No API key found. Set GOOGLE_API_KEY or GEMINI_API_KEY.');
  }
  return key;
}

interface GeminiGenerateOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number; // IGNORED — always 1.0
  system?: string;
  timeout?: number;
}

interface GeminiResult {
  content: string;
  model: string;
  provider: string;
  tokens?: number;
  duration_ms?: number;
}

/**
 * Generate text using Gemini API.
 * Temperature is ALWAYS 1.0 regardless of options.
 */
export async function generate(
  prompt: string,
  options: GeminiGenerateOptions = {},
): Promise<GeminiResult> {
  const apiKey = getApiKey();
  const model = options.model || GEMINI_MODELS.flash;
  const maxTokens = options.maxTokens || 4096;
  const timeout = options.timeout || 60_000;

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const body: {
    contents: { parts: { text: string }[] }[];
    generationConfig: { temperature: number; maxOutputTokens: number; topP: number; topK: number };
    systemInstruction?: { parts: { text: string }[] };
  } = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      // HARDCODED: Temperature is always 1.0 — do not change
      temperature: GEMINI_TEMPERATURE,
      maxOutputTokens: maxTokens,
      topP: 0.95,
      topK: 40,
    },
  };

  if (options.system) {
    body.systemInstruction = { parts: [{ text: options.system }] };
  }

  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content =
      data.candidates?.[0]?.content?.parts?.map((p: { text: string }) => p.text).join('') || '';

    return {
      content,
      model,
      provider: 'gemini',
      tokens: data.usageMetadata?.totalTokenCount,
      duration_ms: Date.now() - startTime,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate with thinking model (for complex reasoning).
 * Temperature is ALWAYS 1.0 regardless of options.
 */
export async function generateWithThinking(
  prompt: string,
  options: GeminiGenerateOptions = {},
): Promise<GeminiResult> {
  return generate(prompt, {
    ...options,
    model: options.model || GEMINI_MODELS.thinking,
  });
}
