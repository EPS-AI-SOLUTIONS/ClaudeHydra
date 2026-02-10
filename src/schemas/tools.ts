/**
 * @fileoverview Enhanced Zod schemas for tool input validation
 * Provides type-safe validation with detailed error messages, security checks,
 * and reusable schema components.
 * @module schemas/tools
 */

import { z } from 'zod';
import { Agents, ModelDefaults, Models, SizeLimits } from '../constants.js';

// Re-export types from tool-schema.js for unified access
export {
  SchemaValidator,
  ToolCategory,
  toolDefinitionSchema,
  toolMetadataSchema,
  validateToolDefinition,
  validateToolInput as validateToolInputJson,
} from './tool-schema.js';

// ============================================================================
// Reusable Schema Components
// ============================================================================

/**
 * Creates a non-empty string schema with custom field name
 * @param {string} fieldName - Name for error messages
 * @param {number} [minLength=1] - Minimum length
 * @returns {z.ZodString} Configured string schema
 */
export const nonEmptyString = (fieldName, minLength = 1) =>
  z
    .string({
      required_error: `${fieldName} is required`,
      invalid_type_error: `${fieldName} must be a string`,
    })
    .trim()
    .min(minLength, `${fieldName} must be at least ${minLength} character(s)`);

/**
 * Safe relative path schema - prevents path traversal and absolute paths
 */
export const safePathSchema = z
  .string()
  .min(1, 'Path cannot be empty')
  .max(1024, 'Path too long (max 1024 characters)')
  .trim()
  .refine((path) => !path.includes('..'), 'Path traversal (..) is not allowed')
  .refine(
    (path) => !path.startsWith('/') && !path.match(/^[a-zA-Z]:/),
    'Absolute paths are not allowed - use relative paths only',
  )
  .refine((path) => !/[\x00-\x1f]/.test(path), 'Path cannot contain control characters')
  .describe('Relative path within the project directory');

/**
 * Absolute path schema for when absolute paths are needed
 */
export const absolutePathSchema = z
  .string()
  .min(1, 'Path cannot be empty')
  .max(1024, 'Path too long')
  .trim()
  .refine((path) => path.startsWith('/') || path.match(/^[a-zA-Z]:/), 'Must be an absolute path')
  .describe('Absolute file path');

/**
 * File content schema with size limits
 */
export const fileContentSchema = z
  .string()
  .max(
    SizeLimits.MAX_FILE_SIZE,
    `Content exceeds maximum size of ${SizeLimits.MAX_FILE_SIZE} bytes`,
  )
  .describe('File content');

/**
 * Positive integer schema
 * @param {string} fieldName - Name for error messages
 */
export const positiveInt = (fieldName) =>
  z
    .number({
      required_error: `${fieldName} is required`,
      invalid_type_error: `${fieldName} must be a number`,
    })
    .int(`${fieldName} must be an integer`)
    .positive(`${fieldName} must be positive`);

/**
 * Tags schema - accepts comma-separated string or array
 */
export const tagsSchema = z
  .union([
    z.string().transform((s) =>
      s
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    ),
    z.array(z.string().trim().min(1)),
  ])
  .optional()
  .describe('Tags for categorization');

/**
 * Model identifier schema
 */
export const modelSchema = z
  .string()
  .trim()
  .min(1, 'Model name is required')
  .default(Models.CORE)
  .describe('AI model identifier');

/**
 * Agent identifier schema
 */
export const agentSchema = z.enum(Object.values(Agents), {
  errorMap: () => ({ message: `Invalid agent. Valid agents: ${Object.values(Agents).join(', ')}` }),
});

/**
 * Temperature parameter (0-2 for flexibility)
 */
export const temperatureSchema = z
  .number({
    invalid_type_error: 'Temperature must be a number',
  })
  .min(0, 'Temperature must be at least 0')
  .max(2, 'Temperature must be at most 2')
  .default(ModelDefaults.TEMPERATURE);

/**
 * Top-P parameter
 */
export const topPSchema = z
  .number()
  .min(0, 'Top-P must be at least 0')
  .max(1, 'Top-P must be at most 1')
  .default(ModelDefaults.TOP_P);

/**
 * URL schema
 */
export const urlSchema = z
  .string()
  .trim()
  .url('Invalid URL format')
  .refine(
    (url) => url.startsWith('http://') || url.startsWith('https://'),
    'URL must use http or https protocol',
  );

// ============================================================================
// Security Patterns
// ============================================================================

/**
 * Dangerous command patterns that should be blocked or require confirmation
 * @readonly
 */
export const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--force)\s+[/~]/i, // Dangerous rm commands
  /rmdir\s+\/s/i, // Windows recursive delete
  /del\s+\/[fqs]/i, // Windows force delete
  /format\s+[a-z]:/i, // Format drive
  /mkfs/i, // Make filesystem
  /dd\s+if=/i, // Direct disk write
  />\s*\/dev\/(sd|hd|nvme)/i, // Write to device
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, // Fork bomb
  /chmod\s+(-R\s+)?777/i, // Insecure permissions
  /curl.*\|\s*(bash|sh)/i, // Pipe to shell
  /wget.*\|\s*(bash|sh)/i, // Pipe to shell
  /eval\s*\(/i, // Eval
  /powershell.*-enc/i, // Encoded PowerShell
  /certutil.*-decode/i, // Base64 decode (often malicious)
  /reg\s+delete/i, // Registry deletion
  /net\s+user.*\/add/i, // Add user
];

/**
 * Commands that should be blocked entirely
 * @readonly
 */
export const BLOCKED_COMMANDS = Object.freeze([
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'init 0',
  'init 6',
  'rm -rf /',
  'rm -rf ~',
  'rm -rf *',
  ':(){:|:&};:',
  'format c:',
  '>(\\\\.\\.pipe\\',
]);

// ============================================================================
// Filesystem Tool Schemas
// ============================================================================

/**
 * List directory contents
 */
export const listDirectorySchema = z
  .object({
    path: safePathSchema.describe('Relative path to directory'),
    recursive: z.boolean().default(false).describe('List recursively'),
    includeHidden: z.boolean().default(false).describe('Include hidden files'),
    maxDepth: z.number().int().min(1).max(10).default(1).describe('Maximum recursion depth'),
    pattern: z.string().optional().describe('Glob pattern to filter files'),
  })
  .strict();

/**
 * Read file contents
 */
export const readFileSchema = z
  .object({
    path: safePathSchema.describe('Relative path to file'),
    encoding: z.enum(['utf8', 'base64', 'binary']).default('utf8').describe('File encoding'),
    maxSize: positiveInt('maxSize')
      .max(SizeLimits.MAX_FILE_SIZE)
      .default(100000)
      .describe('Maximum characters to read'),
    offset: z.number().int().min(0).optional().describe('Byte offset to start reading from'),
    length: positiveInt('length').optional().describe('Number of bytes to read'),
  })
  .strict();

/**
 * Write file contents
 */
export const writeFileSchema = z
  .object({
    path: safePathSchema.describe('Relative path for the file'),
    content: fileContentSchema,
    encoding: z.enum(['utf8', 'base64']).default('utf8').describe('Content encoding'),
    createDirs: z.boolean().default(true).describe('Create parent directories if needed'),
    overwrite: z.boolean().default(true).describe('Overwrite existing file'),
    mode: z.number().int().min(0).max(0o777).optional().describe('File permissions (Unix)'),
  })
  .strict();

/**
 * Delete file or directory
 */
export const deleteFileSchema = z
  .object({
    path: safePathSchema.describe('Relative path to file or directory'),
    recursive: z.boolean().default(false).describe('Delete directories recursively'),
    force: z.boolean().default(false).describe('Ignore nonexistent files'),
  })
  .strict();

// ============================================================================
// Shell Tool Schemas
// ============================================================================

/**
 * Shell command execution
 */
export const shellCommandSchema = z
  .object({
    command: z
      .string()
      .min(1, 'Command cannot be empty')
      .max(10000, 'Command too long (max 10000 characters)')
      .refine(
        (cmd) =>
          !BLOCKED_COMMANDS.some((blocked) => cmd.toLowerCase().includes(blocked.toLowerCase())),
        'This command is blocked for security reasons',
      )
      .describe('Shell command to execute'),

    cwd: safePathSchema.optional().describe('Working directory for command'),

    timeout: z
      .number()
      .int()
      .min(1000, 'Timeout must be at least 1000ms')
      .max(600000, 'Timeout must be at most 600000ms (10 minutes)')
      .default(60000)
      .describe('Timeout in milliseconds'),

    env: z.record(z.string(), z.string()).optional().describe('Additional environment variables'),

    shell: z.enum(['bash', 'sh', 'powershell', 'cmd', 'zsh']).optional().describe('Shell to use'),

    captureStderr: z.boolean().default(true).describe('Capture stderr in output'),

    allowDangerous: z
      .boolean()
      .default(false)
      .describe('Allow potentially dangerous commands (requires explicit confirmation)'),
  })
  .strict();

// ============================================================================
// Knowledge/Memory Schemas
// ============================================================================

/**
 * Add content to knowledge base
 */
export const knowledgeAddSchema = z
  .object({
    content: z
      .string()
      .min(10, 'Content must be at least 10 characters')
      .max(50000, 'Content exceeds maximum of 50000 characters')
      .describe('Text content to store in vector memory'),

    tags: tagsSchema,

    metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata'),

    namespace: z.string().trim().max(100).optional().describe('Namespace for organization'),
  })
  .strict();

/**
 * Search knowledge base
 */
export const knowledgeSearchSchema = z
  .object({
    query: z
      .string()
      .min(3, 'Query must be at least 3 characters')
      .max(1000, 'Query too long')
      .describe('Search query'),

    limit: z
      .number()
      .int()
      .min(1, 'Limit must be at least 1')
      .max(100, 'Limit must be at most 100')
      .default(10)
      .describe('Maximum number of results'),

    threshold: z
      .number()
      .min(0, 'Threshold must be at least 0')
      .max(1, 'Threshold must be at most 1')
      .default(0.5)
      .describe('Minimum similarity threshold'),

    tags: tagsSchema.describe('Filter by tags'),

    namespace: z.string().trim().optional().describe('Filter by namespace'),
  })
  .strict();

/**
 * Delete from knowledge base
 */
export const knowledgeDeleteSchema = z
  .object({
    id: z.string().uuid('Invalid document ID format'),
    namespace: z.string().trim().optional(),
  })
  .strict();

// ============================================================================
// Swarm Tool Schemas
// ============================================================================

/**
 * Agent type for swarm execution
 */
export const swarmAgentSchema = z
  .enum([
    'planner',
    'researcher',
    'coder',
    'reviewer',
    'tester',
    'documenter',
    'security',
    'optimizer',
    'coordinator',
  ])
  .describe('Agent role in swarm execution');

/**
 * Swarm orchestration schema
 */
export const swarmSchema = z
  .object({
    prompt: z
      .string()
      .min(10, 'Prompt must be at least 10 characters')
      .max(10000, 'Prompt too long (max 10000 characters)')
      .describe('Task description for the swarm'),

    agents: z
      .array(swarmAgentSchema)
      .min(1, 'At least one agent required')
      .max(10, 'Maximum 10 agents allowed')
      .optional()
      .describe('Specific agents to use'),

    saveMemory: z.boolean().default(true).describe('Save results to memory'),

    title: z
      .string()
      .trim()
      .max(200, 'Title too long')
      .optional()
      .describe('Title for the swarm session'),

    maxIterations: z
      .number()
      .int()
      .min(1, 'At least 1 iteration required')
      .max(20, 'Maximum 20 iterations allowed')
      .default(6)
      .describe('Maximum iteration count'),

    parallel: z.boolean().default(true).describe('Run agents in parallel where possible'),

    timeout: z
      .number()
      .int()
      .min(5000)
      .max(300000)
      .default(120000)
      .describe('Overall timeout in milliseconds'),
  })
  .strict();

// ============================================================================
// Generation Tool Schemas
// ============================================================================

/**
 * Common generation parameters
 */
export const generationParamsSchema = z
  .object({
    temperature: temperatureSchema,
    topP: topPSchema,
    topK: z.number().int().min(1).max(100).default(40),
    maxTokens: positiveInt('maxTokens').max(SizeLimits.MAX_CONTEXT_TOKENS).optional(),
    stopSequences: z.array(z.string()).max(5).optional(),
  })
  .partial();

/**
 * Text generation schema
 */
export const generateSchema = z
  .object({
    prompt: z
      .string()
      .min(1, 'Prompt cannot be empty')
      .max(SizeLimits.MAX_PROMPT_LENGTH, 'Prompt too long')
      .describe('Prompt for generation'),

    model: modelSchema,

    format: z.enum(['json', 'text']).optional().describe('Output format'),

    stream: z.boolean().default(false).describe('Stream response'),

    system: z.string().max(10000).optional().describe('System prompt'),

    ...generationParamsSchema.shape,
  })
  .strict();

/**
 * Chat completion schema
 */
export const chatSchema = z
  .object({
    model: modelSchema,

    messages: z
      .array(
        z.object({
          role: z.enum(['system', 'user', 'assistant'], {
            errorMap: () => ({ message: 'Role must be "system", "user", or "assistant"' }),
          }),
          content: nonEmptyString('Message content'),
          images: z.array(z.string()).optional(),
        }),
      )
      .min(1, 'At least one message is required')
      .max(100, 'Maximum 100 messages allowed'),

    stream: z.boolean().default(false),
    format: z.enum(['json', 'text']).optional(),
    ...generationParamsSchema.shape,
  })
  .strict();

/**
 * Embeddings generation schema
 */
export const embeddingsSchema = z
  .object({
    model: z.string().default(Models.EMBEDDING),

    input: z
      .union([nonEmptyString('Input'), z.array(nonEmptyString('Input item')).min(1).max(100)])
      .describe('Text or array of texts to embed'),

    truncate: z.boolean().default(true),
  })
  .strict();

// ============================================================================
// API Proxy Schema
// ============================================================================

/**
 * API proxy request schema
 */
export const apiProxySchema = z
  .object({
    url: urlSchema,

    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).default('GET'),

    headers: z.record(z.string(), z.string()).optional(),

    body: z.unknown().optional(),

    timeout: z.number().int().min(1000).max(60000).default(30000),

    responseType: z.enum(['json', 'text', 'arraybuffer']).default('json'),
  })
  .strict();

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates input against a schema
 * @template T
 * @param {z.ZodSchema<T>} schema - Zod schema
 * @param {unknown} input - Input to validate
 * @returns {{ success: true, data: T } | { success: false, error: z.ZodError }}
 */
export function validateInput(schema, input) {
  const result = schema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

/**
 * Validates input and throws on failure
 * @template T
 * @param {z.ZodSchema<T>} schema - Zod schema
 * @param {unknown} input - Input to validate
 * @returns {T} Validated data
 * @throws {z.ZodError} If validation fails
 */
export function validateOrThrow(schema, input) {
  return schema.parse(input);
}

/**
 * Validates shell command safety and returns risk assessment
 * @param {string} command - Command to assess
 * @returns {{ safe: boolean, risks: string[], severity: 'low' | 'medium' | 'high' | 'critical' }}
 */
export function assessCommandRisk(command) {
  const risks = [];
  let severity = 'low';

  // Check blocked commands
  if (BLOCKED_COMMANDS.some((blocked) => command.toLowerCase().includes(blocked.toLowerCase()))) {
    return { safe: false, risks: ['Command is blocked'], severity: 'critical' };
  }

  // Check dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      risks.push(`Matches dangerous pattern: ${pattern.source.slice(0, 50)}`);
      severity = 'high';
    }
  }

  // Additional heuristics
  if (command.includes('sudo') || command.includes('runas') || command.includes('doas')) {
    risks.push('Elevated privileges requested');
    severity = severity === 'low' ? 'medium' : severity;
  }

  if (command.includes('|') && /\b(ba)?sh\b/.test(command)) {
    risks.push('Piping to shell detected');
    severity = 'high';
  }

  if (command.includes('&&') && command.split('&&').length > 5) {
    risks.push('Long command chain detected');
    severity = severity === 'low' ? 'medium' : severity;
  }

  if (command.length > 2000) {
    risks.push('Unusually long command');
    severity = severity === 'low' ? 'medium' : severity;
  }

  // Check for environment variable expansion
  if (/\$\{[^}]+\}/.test(command) || /\$[A-Z_]+/.test(command)) {
    risks.push('Environment variable expansion');
  }

  return {
    safe: risks.length === 0,
    risks,
    severity,
  };
}

/**
 * Formats Zod errors for user display
 * @param {z.ZodError} error - Zod error
 * @returns {string[]} Array of formatted error messages
 */
export function formatZodErrors(error) {
  // Zod v4 uses 'issues' property, v3 uses 'errors'
  const errors = error.issues || error.errors || [];
  return errors.map((err) => {
    const path = err.path && err.path.length > 0 ? `${err.path.join('.')}: ` : '';
    return `${path}${err.message}`;
  });
}

// ============================================================================
// Schema Registry
// ============================================================================

/**
 * Registry of all tool schemas
 * @type {Record<string, z.ZodSchema>}
 */
export const schemaRegistry = Object.freeze({
  // Filesystem
  list_directory: listDirectorySchema,
  read_file: readFileSchema,
  write_file: writeFileSchema,
  delete_file: deleteFileSchema,

  // Shell
  shell_execute: shellCommandSchema,

  // Knowledge
  knowledge_add: knowledgeAddSchema,
  knowledge_search: knowledgeSearchSchema,
  knowledge_delete: knowledgeDeleteSchema,

  // Swarm
  hydra_swarm: swarmSchema,

  // Generation
  ollama_generate: generateSchema,
  ollama_chat: chatSchema,
  ollama_embeddings: embeddingsSchema,

  // API
  api_proxy: apiProxySchema,
});

/**
 * Gets schema for a tool by name
 * @param {string} toolName - Tool name
 * @returns {z.ZodSchema | undefined}
 */
export function getSchemaForTool(toolName) {
  return schemaRegistry[toolName];
}

/**
 * Validates tool input using registered schema
 * @param {string} toolName - Tool name
 * @param {unknown} input - Input to validate
 * @returns {{ success: boolean, data?: unknown, error?: z.ZodError, message?: string }}
 */
export function validateToolInput(toolName, input) {
  const schema = getSchemaForTool(toolName);
  if (!schema) {
    return {
      success: false,
      message: `Unknown tool: ${toolName}. Available: ${Object.keys(schemaRegistry).join(', ')}`,
    };
  }

  const result = validateInput(schema, input);
  if (!result.success) {
    return {
      ...result,
      message: formatZodErrors(result.error).join('; '),
    };
  }
  return result;
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Filesystem
  listDirectorySchema,
  readFileSchema,
  writeFileSchema,
  deleteFileSchema,

  // Shell
  shellCommandSchema,
  assessCommandRisk,
  DANGEROUS_PATTERNS,
  BLOCKED_COMMANDS,

  // Knowledge
  knowledgeAddSchema,
  knowledgeSearchSchema,
  knowledgeDeleteSchema,

  // Swarm
  swarmSchema,
  swarmAgentSchema,

  // Generate
  generateSchema,
  chatSchema,
  embeddingsSchema,

  // API
  apiProxySchema,

  // Common
  safePathSchema,
  absolutePathSchema,
  tagsSchema,
  modelSchema,
  temperatureSchema,
  generationParamsSchema,

  // Helpers
  validateInput,
  validateOrThrow,
  validateToolInput,
  formatZodErrors,
  getSchemaForTool,
  schemaRegistry,

  // Reusable builders
  nonEmptyString,
  positiveInt,
  fileContentSchema,
  urlSchema,
  agentSchema,
  topPSchema,
};
