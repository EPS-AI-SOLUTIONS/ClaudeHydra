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
  main: {
    name: 'main',
    description: 'Primary model for general generation',
    contextSize: 4096,
    capabilities: ['generate', 'chat', 'code', 'json'],
    speed: 'medium'
  },
  draft: {
    name: 'draft',
    description: 'Fast model for routing and simple tasks',
    contextSize: 2048,
    capabilities: ['generate', 'generate_fast'],
    speed: 'fastest'
  },
  vision: {
    name: 'vision',
    description: 'Multimodal model for image analysis',
    contextSize: 4096,
    capabilities: ['vision'],
    speed: 'slow'
  },
  functionary: {
    name: 'functionary',
    description: 'Model specialized for function calling',
    contextSize: 4096,
    capabilities: ['function_call'],
    speed: 'medium'
  }
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
  'draft': { role: 'router', maxTokens: 512, speed: 'fastest' },
  'main': { role: 'researcher', maxTokens: 2048, speed: 'fast' },
  'main:coder': { role: 'coder', maxTokens: 4096, speed: 'fast' },
  'main:reasoner': { role: 'reasoner', maxTokens: 2048, speed: 'medium' }
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
    model: 'draft',
    tool: 'llama_generate_fast',
    maxTokens: 512,
    temperature: 0.3
  },

  // Research - balanced speed and quality
  research: {
    model: 'main',
    tool: 'llama_generate',
    maxTokens: 2048,
    temperature: 0.7
  },

  // Code generation and analysis
  code: {
    model: 'main',
    tool: 'llama_code',
    maxTokens: 4096,
    temperature: 0.4
  },

  // Structured JSON output
  json: {
    model: 'main',
    tool: 'llama_json',
    maxTokens: 2048,
    temperature: 0.3
  },

  // Reasoning and analysis
  reason: {
    model: 'main',
    tool: 'llama_json',
    maxTokens: 2048,
    temperature: 0.5
  },

  // Text analysis (sentiment, summary, etc.)
  analyze: {
    model: 'main',
    tool: 'llama_analyze',
    maxTokens: 1024,
    temperature: 0.3
  },

  // Embeddings for semantic search
  embed: {
    model: 'main',
    tool: 'llama_embed',
    maxTokens: 0,
    temperature: 0
  },

  // Image analysis
  vision: {
    model: 'vision',
    tool: 'llama_vision',
    maxTokens: 1024,
    temperature: 0.5
  },

  // Function calling
  function_call: {
    model: 'functionary',
    tool: 'llama_function_call',
    maxTokens: 2048,
    temperature: 0.3
  },

  // Chat/conversation
  chat: {
    model: 'main',
    tool: 'llama_chat',
    maxTokens: 2048,
    temperature: 0.7
  },

  // Default fallback
  default: {
    model: 'main',
    tool: 'llama_generate',
    maxTokens: 2048,
    temperature: 0.7
  }
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
  // Speed specialist - fastest responses
  Ciri: {
    model: 'draft',
    tool: 'llama_generate_fast',
    maxTokens: 512,
    description: 'Fastest executor for simple tasks'
  },

  // Security specialist
  Geralt: {
    model: 'main',
    tool: 'llama_generate',
    maxTokens: 2048,
    description: 'Security analysis and operations'
  },

  // Testing specialist - code focused
  Triss: {
    model: 'main',
    tool: 'llama_code',
    maxTokens: 4096,
    description: 'QA and testing code generation'
  },

  // Mentor/reviewer
  Vesemir: {
    model: 'main',
    tool: 'llama_generate',
    maxTokens: 2048,
    description: 'Code review and mentoring'
  },

  // DevOps/infrastructure
  Eskel: {
    model: 'main',
    tool: 'llama_generate',
    maxTokens: 2048,
    description: 'DevOps and infrastructure'
  },

  // Debug specialist - code focused
  Lambert: {
    model: 'main',
    tool: 'llama_code',
    maxTokens: 4096,
    description: 'Debugging and code analysis'
  },

  // Data/database specialist - structured output
  Zoltan: {
    model: 'main',
    tool: 'llama_json',
    maxTokens: 2048,
    description: 'Data processing and SQL'
  },

  // API/integrations - function calling
  Philippa: {
    model: 'functionary',
    tool: 'llama_function_call',
    maxTokens: 2048,
    description: 'API integrations and function calls'
  }
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
  getModelRole
};
