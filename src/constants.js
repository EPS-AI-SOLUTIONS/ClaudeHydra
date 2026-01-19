// Centralized constants for GeminiCLI (Hydra)

export const MODELS = {
  FAST: 'llama3.2:1b',
  CORE: 'llama3.2:3b',
  CODE: 'qwen2.5-coder:1.5b',
  ANALYSIS: 'phi3:mini',
  EMBEDDING: 'nomic-embed-text'
};

export const AGENTS = {
  GERALT: 'Geralt',
  YENNEFER: 'Yennefer',
  TRISS: 'Triss',
  JASKIER: 'Jaskier',
  VESEMIR: 'Vesemir',
  CIRI: 'Ciri',
  ESKEL: 'Eskel',
  LAMBERT: 'Lambert',
  ZOLTAN: 'Zoltan',
  REGIS: 'Regis',
  DIJKSTRA: 'Dijkstra',
  PHILIPPA: 'Philippa'
};

export const PATHS = {
  MEMORY_DIR: '.serena/memories',
  LOG_DIR: '.hydra-data/logs',
  CONFIG_DIR: '.gemini',
  TEMP_DIR: '.gemini/tmp'
};

export const DEFAULTS = {
  TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
  CONTEXT_WINDOW: 4096
};