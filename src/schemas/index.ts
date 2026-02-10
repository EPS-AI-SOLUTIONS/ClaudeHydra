/**
 * @fileoverview Central export for all schemas
 * Provides unified access to Zod schemas and JSON Schema utilities
 * @module schemas
 */

// ============================================================================
// JSON Schema Exports (from tool-schema.js)
// ============================================================================
export {
  SchemaValidator,
  ToolCategory,
  toolDefinitionSchema,
  toolMetadataSchema,
  validateToolDefinition,
  validateToolInput as validateToolInputJson,
} from './tool-schema.js';

// ============================================================================
// Zod Schema Exports (from tools.js)
// ============================================================================

// ============================================================================
// File Schemas (Buffer-based for CLI/Node.js)
// ============================================================================
export {
  // Preset schemas
  codeFileSchema,
  // Factory
  createFileBufferSchema,
  documentFileSchema,
  type FileBuffer,
  type FileBufferSchemaOptions,
  // Buffer schemas
  fileBufferSchema,
  // Path schema
  filePathSchema,
  formatFileErrors,
  imageFileSchema,
  // Validation utilities
  validateFileBuffer,
} from './file.js';
// Filesystem schemas
// Shell schemas
// Knowledge/Memory schemas
// Swarm schemas
// Generation schemas
// API schemas
// ============================================================================
// Reusable Schema Components
// ============================================================================
// ============================================================================
// Validation Utilities
// ============================================================================
export {
  absolutePathSchema,
  agentSchema,
  apiProxySchema,
  assessCommandRisk,
  BLOCKED_COMMANDS,
  chatSchema,
  DANGEROUS_PATTERNS,
  deleteFileSchema,
  embeddingsSchema,
  fileContentSchema,
  formatZodErrors,
  generateSchema,
  generationParamsSchema,
  getSchemaForTool,
  knowledgeAddSchema,
  knowledgeDeleteSchema,
  knowledgeSearchSchema,
  listDirectorySchema,
  // Model schemas
  modelSchema,
  // String schemas
  nonEmptyString,
  // Number schemas
  positiveInt,
  readFileSchema,
  // Path schemas
  safePathSchema,
  // Schema registry
  schemaRegistry,
  shellCommandSchema,
  swarmAgentSchema,
  swarmSchema,
  tagsSchema,
  temperatureSchema,
  topPSchema,
  urlSchema,
  validateInput,
  validateOrThrow,
  validateToolInput,
  writeFileSchema,
} from './tools.js';

import jsonSchemas from './tool-schema.js';
// ============================================================================
// Default Exports
// ============================================================================
import toolSchemas from './tools.js';

/**
 * Combined schema exports
 * @type {Object}
 */
export default {
  ...toolSchemas,
  ...jsonSchemas,
};
