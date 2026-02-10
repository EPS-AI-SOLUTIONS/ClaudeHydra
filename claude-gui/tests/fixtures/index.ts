/**
 * Central export barrel for all test fixtures.
 */

// Test framework
export { test, expect, setupTest, setupThemeTest } from './test-setup';

// Tauri mocks
export {
  DEFAULT_MOCK_RESPONSES,
  injectTauriMocks,
  emitTauriEvent,
  setMockInvokeResult,
  getInvokeHistory,
  clearInvokeHistory,
  emitStreamChunk,
  emitStreamError,
  createMockMemories,
  createMockKnowledgeGraph,
} from './tauri-mocks';

// Stream simulator
export { StreamSimulator, createStreamSimulator } from './stream-simulator';

// Test data
export {
  AGENTS,
  AGENT_NAMES,
  VIEWS,
  NAV_LABELS,
  SELECTORS,
  SHORTCUTS,
  TIMEOUTS,
  TEST_MESSAGES,
  TEST_PROMPTS,
  TEST_SETTINGS,
  UI_TEXTS,
  LIMITS,
  generateTestId,
  generateText,
  createTestMessage,
  createSwarmAgentMessages,
} from './test-data';
export type { ViewId } from './test-data';
