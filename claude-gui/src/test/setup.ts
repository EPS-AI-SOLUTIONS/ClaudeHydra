import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock localStorage for Zustand persist
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] || null,
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock Tauri API for testing outside Tauri context
const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
  switch (cmd) {
    case 'get_session_status':
      return Promise.resolve({
        running: false,
        session_id: null,
        working_dir: null,
        cli_path: null,
      });
    case 'get_approval_rules':
      return Promise.resolve([]);
    case 'get_approval_history':
      return Promise.resolve([]);
    case 'ollama_health_check':
      return Promise.resolve(true);
    case 'ollama_list_models':
      return Promise.resolve([
        { name: 'llama3.2:3b', size: 2147483648, modified_at: '2024-01-01' },
        { name: 'qwen2.5-coder:1.5b', size: 1073741824, modified_at: '2024-01-01' },
      ]);
    default:
      return Promise.resolve();
  }
});

// Export for test manipulation
export { mockInvoke };

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockReturnValue(Promise.resolve(() => {})),
  emit: vi.fn().mockReturnValue(Promise.resolve()),
}));

// Mock window.__TAURI__ for components that check it
Object.defineProperty(window, '__TAURI__', {
  value: {
    invoke: mockInvoke,
  },
  writable: true,
  configurable: true,
});

// Mock __TAURI_INTERNALS__ as well for isTauri() checks
Object.defineProperty(window, '__TAURI_INTERNALS__', {
  value: {},
  writable: true,
  configurable: true,
});
