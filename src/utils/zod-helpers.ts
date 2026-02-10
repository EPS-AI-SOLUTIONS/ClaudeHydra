/**
 * @fileoverview Shared Zod transformer helpers for environment variable parsing
 * Eliminates duplication of env parsing logic across config modules.
 * @module utils/zod-helpers
 */

import { z } from 'zod';

/**
 * Checks if an environment variable value is effectively empty.
 */
function isEnvEmpty(val: unknown): boolean {
  return val === undefined || val === null || val === '';
}

/**
 * Coerces a string environment variable to a number with a default fallback.
 */
export const envNumber = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((val) => {
      if (isEnvEmpty(val)) return defaultValue;
      const parsed = Number(val);
      return Number.isNaN(parsed) ? defaultValue : parsed;
    });

/**
 * Coerces a string environment variable to a number within a range.
 * Combines envNumber with .pipe(z.number().int().min().max()) pattern.
 */
export const envNumberInRange = (defaultValue: number, min: number, max: number) =>
  envNumber(defaultValue).pipe(z.number().int().min(min).max(max));

/**
 * Coerces a string environment variable to a boolean.
 */
export const envBoolean = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((val) => {
      if (isEnvEmpty(val)) return defaultValue;
      return val === 'true';
    });

/**
 * String environment variable with a default value.
 */
export const envString = (defaultValue: string) =>
  z
    .string()
    .optional()
    .default(defaultValue)
    .transform((val) => val || defaultValue);

/**
 * Parses Zod validation issues into a structured error format.
 */
export function parseZodErrors(issues: z.ZodIssue[]) {
  return issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path[issue.path.length - 1] : 'unknown';
    const path = issue.path.join('.');
    return { field: String(field), message: issue.message, code: issue.code, path };
  });
}

/**
 * Formats Zod issues as a human-readable error string.
 */
export function formatZodErrors(issues: z.ZodIssue[]): string {
  return issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
}
