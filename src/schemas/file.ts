/**
 * @fileoverview File validation schemas for CLI/Node.js environment
 * Uses Buffer-based validation for file operations
 * @module schemas/file
 */

import { z } from 'zod';

// =============================================================================
// NODE.JS FILE SCHEMAS
// =============================================================================

/**
 * File path schema - validates path string
 */
export const filePathSchema = z.string().min(1, 'File path is required');

/**
 * Node.js file buffer representation (for CLI uploads/processing)
 */
export const fileBufferSchema = z.object({
  /** Original file path */
  path: filePathSchema,
  /** File content as Buffer */
  buffer: z.instanceof(Buffer),
  /** Original filename */
  filename: z.string().min(1, 'Filename is required'),
  /** MIME type */
  mimetype: z.string().min(1, 'MIME type is required'),
  /** File size in bytes */
  size: z.number().nonnegative(),
});

export type FileBuffer = z.infer<typeof fileBufferSchema>;

/**
 * Configuration options for file buffer schema factory
 */
export interface FileBufferSchemaOptions {
  /** Maximum file size in bytes */
  maxSizeBytes?: number;
  /** Allowed MIME types */
  allowedMimeTypes?: string[];
  /** Allowed file extensions */
  allowedExtensions?: string[];
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Create configurable file buffer schema
 */
export function createFileBufferSchema(options: FileBufferSchemaOptions = {}) {
  const { maxSizeBytes, allowedMimeTypes, allowedExtensions } = options;

  let schema = fileBufferSchema;

  // Size validation
  if (maxSizeBytes) {
    schema = schema.refine((f) => f.size <= maxSizeBytes, {
      message: `File size exceeds limit (${formatBytes(maxSizeBytes)})`,
    });
  }

  // MIME type validation
  if (allowedMimeTypes?.length) {
    schema = schema.refine((f) => allowedMimeTypes.includes(f.mimetype), {
      message: `MIME type not allowed. Allowed: ${allowedMimeTypes.join(', ')}`,
    });
  }

  // Extension validation
  if (allowedExtensions?.length) {
    schema = schema.refine(
      (f) => {
        const ext = `.${f.filename.split('.').pop()?.toLowerCase()}`;
        return allowedExtensions.includes(ext);
      },
      {
        message: `Extension not allowed. Allowed: ${allowedExtensions.join(', ')}`,
      },
    );
  }

  return schema;
}

// =============================================================================
// PRESET SCHEMAS
// =============================================================================

/**
 * Code file schema for CLI operations
 */
export const codeFileSchema = createFileBufferSchema({
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
  allowedExtensions: [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.py',
    '.rs',
    '.go',
    '.java',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.cs',
    '.rb',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.xml',
    '.html',
    '.css',
    '.scss',
    '.md',
  ],
});

/**
 * Document file schema for CLI operations
 */
export const documentFileSchema = createFileBufferSchema({
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  allowedMimeTypes: [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/json',
    'text/csv',
  ],
});

/**
 * Image file schema for CLI operations
 */
export const imageFileSchema = createFileBufferSchema({
  maxSizeBytes: 100 * 1024 * 1024, // 100MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif'],
});

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Validate file buffer and return result
 */
export function validateFileBuffer<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Format Zod errors for CLI output
 */
export function formatFileErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

// =============================================================================
// RE-EXPORT ZOD
// =============================================================================

export { z };
