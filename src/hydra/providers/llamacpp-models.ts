/**
 * @fileoverview LlamaCpp Model Configuration
 * Defines GGUF model roles and task-to-model mapping for llama-cpp MCP backend
 *
 * @module hydra/providers/llamacpp-models
 */

// =============================================================================
// Model Definitions
// =============================================================================

/**
 * Available GGUF models with their capabilities
 * Models are managed by the llama-cpp MCP server
 * @type {Object<string, Object>}
 */
export const GGUF_MODELS = {
  'qwen3:8b': {
    name: 'qwen3:8b',
    description: 'Heavy model for reasoning, architecture and code (8B)',
    contextSize: 8192,
    capabilities: ['generate', 'chat', 'code', 'json', 'function_call'],
    speed: 'medium',
  },
  'qwen3:4b': {
    name: 'qwen3:4b',
    description: 'Balanced model for general tasks (4B)',
    contextSize: 8192,
    capabilities: ['generate', 'chat', 'code', 'json', 'function_call'],
    speed: 'fast',
  },
  'qwen3:1.7b': {
    name: 'qwen3:1.7b',
    description: 'Fast scout model for routing and simple tasks (1.7B)',
    contextSize: 4096,
    capabilities: ['generate', 'chat', 'generate_fast'],
    speed: 'fastest',
  },
  vision: {
    name: 'vision',
    description: 'Multimodal model for image analysis',
    contextSize: 4096,
    capabilities: ['vision'],
    speed: 'slow',
  },
};

// =============================================================================
// Model Roles (mirrors Ollama structure for compatibility)
// =============================================================================

/**
 * Model roles for task-specific optimization
 * Mirrors the Ollama MODEL_ROLES structure for compatibility
 * @type {Object<string, Object>}
 */
export const MODEL_ROLES = {
  'qwen3:1.7b': { role: 'router', maxTokens: 512, speed: 'fastest' },
  'qwen3:4b': { role: 'researcher', maxTokens: 2048, speed: 'fast' },
  'qwen3:8b': { role: 'coder', maxTokens: 4096, speed: 'medium' },
  'qwen3:8b:reasoner': { role: 'reasoner', maxTokens: 4096, speed: 'medium' },
};

// =============================================================================
// Task to Model Mapping
// =============================================================================

/**
 * Maps task types to appropriate GGUF models and MCP tools
 * @type {Object<string, Object>}
 */
export const TASK_MODEL_MAP = {
  // Routing - fastest response needed
  route: {
    model: 'qwen3:1.7b',
    tool: 'ollama_generate',
    maxTokens: 512,
    temperature: 0.3,
  },

  // Research - balanced speed and quality
  research: {
    model: 'qwen3:4b',
    tool: 'ollama_generate',
    maxTokens: 2048,
    temperature: 0.7,
  },

  // Code generation and analysis
  code: {
    model: 'qwen3:8b',
    tool: 'ollama_generate',
    maxTokens: 4096,
    temperature: 0.4,
  },

  // Structured JSON output
  json: {
    model: 'qwen3:4b',
    tool: 'ollama_generate',
    maxTokens: 2048,
    temperature: 0.3,
  },

  // Reasoning and analysis
  reason: {
    model: 'qwen3:8b',
    tool: 'ollama_generate',
    maxTokens: 4096,
    temperature: 0.5,
  },

  // Text analysis
  analyze: {
    model: 'qwen3:4b',
    tool: 'ollama_generate',
    maxTokens: 1024,
    temperature: 0.3,
  },

  // Embeddings for semantic search
  embed: {
    model: 'qwen3:4b',
    tool: 'ollama_embed',
    maxTokens: 0,
    temperature: 0,
  },

  // Image analysis (not available in ollama-mcp)
  vision: {
    model: 'vision',
    tool: 'ollama_generate',
    maxTokens: 1024,
    temperature: 0.5,
  },

  // Function calling (Qwen3 supports tool use natively)
  function_call: {
    model: 'qwen3:8b',
    tool: 'ollama_chat',
    maxTokens: 2048,
    temperature: 0.3,
  },

  // Chat/conversation
  chat: {
    model: 'qwen3:4b',
    tool: 'ollama_chat',
    maxTokens: 2048,
    temperature: 0.7,
  },

  // Default fallback
  default: {
    model: 'qwen3:4b',
    tool: 'ollama_generate',
    maxTokens: 2048,
    temperature: 0.7,
  },
};

// =============================================================================
// Witcher Swarm Agent Configuration
// =============================================================================

/**
 * Maps Swarm executor agents to their optimal llama-cpp configurations
 * Replaces EXECUTOR_MODELS from ollama agents.js
 * @type {Object<string, Object>}
 */
export const EXECUTOR_AGENT_MODELS = {
  // Speed specialist - fastest responses (scout)
  Ciri: {
    model: 'qwen3:1.7b',
    tool: 'ollama_generate',
    maxTokens: 512,
    description: 'Fastest executor for simple tasks',
  },

  // Documentation & Logging
  Jaskier: {
    model: 'qwen3:4b',
    tool: 'ollama_generate',
    maxTokens: 2048,
    description: 'Documentation and logging',
  },

  // Security specialist
  Geralt: {
    model: 'qwen3:4b',
    tool: 'ollama_generate',
    maxTokens: 2048,
    description: 'Security analysis and operations',
  },

  // Data & Integration specialist
  Triss: {
    model: 'qwen3:4b',
    tool: 'ollama_generate',
    maxTokens: 4096,
    description: 'Data integration and transformation',
  },

  // Mentor/reviewer
  Vesemir: {
    model: 'qwen3:4b',
    tool: 'ollama_generate',
    maxTokens: 2048,
    description: 'Code review and mentoring',
  },

  // Testing & Stability
  Eskel: {
    model: 'qwen3:4b',
    tool: 'ollama_generate',
    maxTokens: 2048,
    description: 'Testing and stability',
  },

  // Refactoring & Cleanup
  Lambert: {
    model: 'qwen3:4b',
    tool: 'ollama_generate',
    maxTokens: 4096,
    description: 'Refactoring and code cleanup',
  },

  // Infrastructure & DevOps
  Zoltan: {
    model: 'qwen3:4b',
    tool: 'ollama_generate',
    maxTokens: 2048,
    description: 'Infrastructure and DevOps',
  },

  // UI/UX & Frontend
  Philippa: {
    model: 'qwen3:4b',
    tool: 'ollama_chat',
    maxTokens: 2048,
    description: 'UI/UX and frontend development',
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get model configuration for a task type
 * @param {string} taskType - Type of task (route, research, code, etc.)
 * @returns {Object} Model configuration with model, tool, maxTokens, temperature
 */
export function getModelForTask(taskType) {
  return TASK_MODEL_MAP[taskType] || TASK_MODEL_MAP.default;
}

/**
 * Get model configuration for a Swarm agent
 * @param {string} agentName - Name of the Swarm agent
 * @returns {Object|null} Agent model configuration or null
 */
export function getModelForAgent(agentName) {
  return EXECUTOR_AGENT_MODELS[agentName] || null;
}

/**
 * Check if a model supports a specific capability
 * @param {string} modelName - Name of the model
 * @param {string} capability - Capability to check
 * @returns {boolean} Whether model supports the capability
 */
export function modelSupportsCapability(modelName, capability) {
  const model = GGUF_MODELS[modelName];
  return model ? model.capabilities.includes(capability) : false;
}

/**
 * Get all available model names
 * @returns {string[]} Array of model names
 */
export function getAvailableModels() {
  return Object.keys(GGUF_MODELS);
}

/**
 * Get model role information (compatible with Ollama structure)
 * @param {string} modelName - Name of the model
 * @returns {Object|undefined} Model role or undefined
 */
export function getModelRole(modelName) {
  return MODEL_ROLES[modelName];
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  GGUF_MODELS,
  MODEL_ROLES,
  TASK_MODEL_MAP,
  EXECUTOR_AGENT_MODELS,
  getModelForTask,
  getModelForAgent,
  modelSupportsCapability,
  getAvailableModels,
  getModelRole,
};
