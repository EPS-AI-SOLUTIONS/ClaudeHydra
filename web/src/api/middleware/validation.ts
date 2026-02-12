import { zValidator } from '@hono/zod-validator';
import type { ZodSchema } from 'zod';

/**
 * Convenience re-export of @hono/zod-validator for JSON body validation.
 * Usage: `.post("/path", jsonBody(mySchema), (c) => { ... })`
 */
export function jsonBody<T extends ZodSchema>(schema: T) {
  return zValidator('json', schema);
}
