/**
 * @fileoverview Gemini Model Definitions
 * @module hydra/providers/gemini-models
 */

export const GEMINI_MODELS = {
  flash: 'gemini-2.0-flash-exp',
  thinking: 'gemini-2.0-flash-thinking-exp',
  pro: 'gemini-1.5-pro',
} as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[keyof typeof GEMINI_MODELS];

/**
 * HARDCODED Gemini temperature — always 1.0, cannot be overridden.
 * This constant is used across all Gemini API calls.
 */
export const GEMINI_TEMPERATURE = 1.0 as const;
