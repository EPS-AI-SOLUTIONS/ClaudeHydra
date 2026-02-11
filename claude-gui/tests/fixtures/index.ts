/**
 * Central export barrel for all test fixtures.
 */

// Stream simulator
export { createStreamSimulator, StreamSimulator } from './stream-simulator';

// Tauri mocks
export {
  clearInvokeHistory,
  createMockKnowledgeGraph,
  createMockMemories,
  DEFAULT_MOCK_RESPONSES,
  emitStreamChunk,
  emitStreamError,
  emitTauriEvent,
  getInvokeHistory,
  injectTauriMocks,
  setMockInvokeResult,
} from './tauri-mocks';
export type { ViewId } from './test-data';

// Test data
export {
  AGENT_NAMES,
  AGENTS,
  createSwarmAgentMessages,
  createTestMessage,
  generateTestId,
  generateText,
  LIMITS,
  NAV_LABELS,
  SELECTORS,
  SHORTCUTS,
  TEST_MESSAGES,
  TEST_PROMPTS,
  TEST_SETTINGS,
  TIMEOUTS,
  UI_TEXTS,
  VIEWS,
} from './test-data';
// Test framework
export { expect, setupTest, setupThemeTest, test } from './test-setup';
