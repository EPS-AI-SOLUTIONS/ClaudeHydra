/**
 * @fileoverview Central export for all schemas
 * Provides unified access to Zod schemas and JSON Schema utilities
 * @module schemas
 */

// ============================================================================
// JSON Schema Exports (from tool-schema.js)
// ============================================================================
export {
  ToolCategory,
  toolMetadataSchema,
  toolDefinitionSchema,
  SchemaValidator,
  validateToolDefinition,
  validateToolInput as validateToolInputJson
} from './tool-schema.js';

// ============================================================================
// Zod Schema Exports (from tools.js)
// ============================================================================

// Filesystem schemas
export {
  listDirectorySchema,
  readFileSchema,
  writeFileSchema,
  deleteFileSchema
} from './tools.js';

// Shell schemas
export {
  shellCommandSchema,
  DANGEROUS_PATTERNS,
  BLOCKED_COMMANDS,
  assessCommandRisk
} from './tools.js';

// Knowledge/Memory schemas
export {
  knowledgeAddSchema,
  knowledgeSearchSchema,
  knowledgeDeleteSchema
} from './tools.js';

// Swarm schemas
export {
  swarmSchema,
  swarmAgentSchema
} from './tools.js';

// Generation schemas
export {
  generateSchema,
  chatSchema,
  embeddingsSchema,
  generationParamsSchema
} from './tools.js';

// API schemas
export {
  apiProxySchema
} from './tools.js';

// ============================================================================
// Reusable Schema Components
// ============================================================================
export {
  // Path schemas
  safePathSchema,
  absolutePathSchema,

  // String schemas
  nonEmptyString,
  fileContentSchema,
  urlSchema,
  tagsSchema,

  // Number schemas
  positiveInt,
  temperatureSchema,
  topPSchema,

  // Model schemas
  modelSchema,
  agentSchema,

  // Schema registry
  schemaRegistry,
  getSchemaForTool
} from './tools.js';

// ============================================================================
// Validation Utilities
// ============================================================================
export {
  validateInput,
  validateOrThrow,
  validateToolInput,
  formatZodErrors
} from './tools.js';

// ============================================================================
// Default Exports
// ============================================================================
import toolSchemas from './tools.js';
import jsonSchemas from './tool-schema.js';

/**
 * Combined schema exports
 * @type {Object}
 */
export default {
  ...toolSchemas,
  ...jsonSchemas
};
