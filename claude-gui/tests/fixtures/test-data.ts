/**
 * Test data constants for ClaudeHydra E2E tests.
 * Contains selectors, agents, messages, shortcuts, and helpers.
 */

// ── Wolf Swarm Agents ──────────────────────────────────────────────────────────

export const AGENTS = [
  { name: 'Geralt', role: 'Security Lead', color: 'text-gray-400' },
  { name: 'Yennefer', role: 'Architect', color: 'text-purple-400' },
  { name: 'Triss', role: 'QA Engineer', color: 'text-red-400' },
  { name: 'Jaskier', role: 'UX Writer', color: 'text-yellow-400' },
  { name: 'Vesemir', role: 'Code Reviewer', color: 'text-amber-400' },
  { name: 'Ciri', role: 'Performance', color: 'text-cyan-400' },
  { name: 'Eskel', role: 'DevOps', color: 'text-green-400' },
  { name: 'Lambert', role: 'Debugger', color: 'text-orange-400' },
  { name: 'Zoltan', role: 'Data Engineer', color: 'text-stone-400' },
  { name: 'Dijkstra', role: 'Strategist', color: 'text-blue-400' },
  { name: 'Philippa', role: 'API Specialist', color: 'text-pink-400' },
  { name: 'Regis', role: 'Researcher', color: 'text-indigo-400' },
  { name: 'Avallach', role: 'Knowledge Seeker', color: 'text-teal-400' },
  { name: 'Vilgefortz', role: 'Self-Learning', color: 'text-rose-400' },
  { name: 'Alzur', role: 'AI Trainer', color: 'text-amber-500' },
] as const;

export const AGENT_NAMES = AGENTS.map((a) => a.name);

// ── Views ──────────────────────────────────────────────────────────────────────

export const VIEWS = {
  terminal: 'terminal',
  ollama: 'ollama',
  learning: 'learning',
  debug: 'debug',
  chats: 'chats',
  rules: 'rules',
  history: 'history',
  settings: 'settings',
} as const;

export type ViewId = (typeof VIEWS)[keyof typeof VIEWS];

// ── Navigation Labels (Polish) ─────────────────────────────────────────────────

export const NAV_LABELS: Record<ViewId, string> = {
  terminal: 'Terminal',
  ollama: 'Ollama AI',
  learning: 'AI Learning',
  debug: 'Debug LiveView',
  chats: 'Historia czatów',
  rules: 'Reguły auto-appr.',
  history: 'Historia zatwierdzeń',
  settings: 'Ustawienia',
};

// ── CSS / DOM Selectors ────────────────────────────────────────────────────────

export const SELECTORS = {
  // Sidebar
  sidebar: {
    container: 'aside',
    navItem: 'button.nav-item',
    collapseBtn: 'aside >> button:has-text("Zwiń")',
    newSessionBtn: 'button[title="Nowy czat"]',
    sessionItem: 'aside .group',
    startBtn: 'button:has-text("Start")',
    stopBtn: 'button:has-text("Zatrzymaj")',
    autoApproveBtn: 'button:has-text("Auto-zatw.")',
    statusDot: '.status-dot',
    statusActive: 'text=Aktywny',
    statusInactive: 'text=Nieaktywny',
    sessionEmpty: 'text=Brak sesji',
    logoText: 'text=Claude HYDRA',
  },

  // Terminal View
  terminal: {
    container: '.terminal-container',
    input: 'input[placeholder*="message"], input[placeholder*="session"]',
    sendBtn: 'button[type="submit"]',
    clearBtn: 'button[title="Clear output"]',
    directTestBtn: 'button[title="Direct IPC Test"]',
    emptyState: 'text=No output yet.',
    outputLine: '.terminal-container > div',
  },

  // Ollama Chat View
  chat: {
    heading: 'text=Ollama Chat',
    input: 'textarea[placeholder*="Type a message"]',
    sendBtn: 'button.glass-button-primary:has(svg)',
    modelSelect: 'select',
    clearBtn: 'button[title="Clear chat"]',
    emptyState: 'text=Start chatting with Ollama',
    messageUser: '.justify-end',
    messageAssistant: '.justify-start',
    streamingIndicator: '.animate-spin',
    attachBtn: 'button[title="Attach file"]',
    codeBlock: 'pre code',
  },

  // Settings View
  settings: {
    heading: 'text=Settings',
    workingDirInput: 'input[placeholder*="path"][placeholder*="project"]',
    cliPathInput: 'input[placeholder*="cli.js"]',
    themeToggle: 'button:near(:text("Theme"))',
    ollamaUrlInput: 'input[placeholder*="127.0.0.1:11434"]',
    anthropicUrlInput: 'input[placeholder*="api.anthropic.com"]',
    openaiUrlInput: 'input[placeholder*="api.openai.com"]',
    apiKeyAnthropicInput: 'input[placeholder*="sk-ant-"]',
    apiKeyOpenaiInput: 'input[placeholder*="sk-"]',
    apiKeyGoogleInput: 'input[placeholder*="AIza"]',
    collapsibleSection: 'button:has(svg.lucide-chevron-right)',
    aboutVersion: 'text=Claude HYDRA v0.1.0',
  },

  // Memory Panel
  memory: {
    container: '.bg-matrix-bg-secondary\\/50',
    heading: 'text=Agent Memory',
    agentSelect: 'select',
    searchInput: 'input[placeholder*="Search memories"]',
    refreshBtn: 'button[title="Refresh"]',
    clearBtn: 'button[title="Clear memories"]',
    knowledgeGraphHeading: 'text=Knowledge Graph',
    emptyState: 'text=No memories found',
    memoryEntry: '.bg-black\\/20',
  },

  // Header
  header: {
    container: 'header',
  },

  // General
  general: {
    glassPanel: '.glass-panel',
    glassButton: '.glass-button',
    glassInput: '.glass-input',
    loader: '.animate-spin',
  },
} as const;

// ── Keyboard Shortcuts ─────────────────────────────────────────────────────────

export const SHORTCUTS = {
  enter: 'Enter',
  shiftEnter: 'Shift+Enter',
  escape: 'Escape',
  tab: 'Tab',
} as const;

// ── Timeouts ───────────────────────────────────────────────────────────────────

export const TIMEOUTS = {
  short: 1000,
  medium: 5000,
  long: 15000,
  veryLong: 30000,
  streaming: 60000,
} as const;

// ── Test Messages ──────────────────────────────────────────────────────────────

export const TEST_MESSAGES = {
  simple: 'Hello, this is a test message',
  polish: 'Cześć, to jest testowa wiadomość',
  withNewlines: 'Line 1\nLine 2\nLine 3',
  long: 'A'.repeat(500),
  markdown: '# Heading\n\n**Bold** and *italic* text\n\n- List item 1\n- List item 2',
  code: '```typescript\nconst x = 42;\nconsole.log(x);\n```',
  dangerous: 'rm -rf / && sudo shutdown now',
} as const;

// ── Test Prompts (Swarm) ───────────────────────────────────────────────────────

export const TEST_PROMPTS = {
  systemStatus: 'Describe the current system status and architecture',
  projectAnalysis: 'Analyze the project structure and identify issues',
  gitHistory: 'Show recent git activity and changes',
  codeReview: 'Review the latest code changes for quality and security',
  simple: 'What is 2+2?',
} as const;

// ── Test Settings ──────────────────────────────────────────────────────────────

export const TEST_SETTINGS = {
  workingDir: 'C:\\Users\\Test\\Desktop\\TestProject',
  cliPath: 'C:\\Users\\Test\\Desktop\\TestProject\\bin\\cli.js',
  ollamaUrl: 'http://127.0.0.1:11434',
  anthropicUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant-test-key-12345',
} as const;

// ── UI Texts (Polish) ──────────────────────────────────────────────────────────

export const UI_TEXTS = {
  sidebar: {
    sessions: 'Sesje',
    newChat: 'Nowy czat',
    noSessions: 'Brak sesji',
    collapse: 'Zwiń',
    active: 'Aktywny',
    inactive: 'Nieaktywny',
    connecting: 'Łączenie...',
    start: 'Start',
    stop: 'Zatrzymaj',
    autoApproveOn: 'Auto-zatw.: WŁ',
    autoApproveOff: 'Auto-zatw.: WYŁ',
    rename: 'Zmień nazwę',
    delete: 'Usuń',
    messages: 'wiadomości',
  },
  terminal: {
    emptyState: 'No output yet.',
    startFirst: 'Start a session to begin.',
    placeholder: 'Type a message or command...',
    placeholderDisabled: 'Start a session first',
    clearOutput: 'Clear output',
    directTest: 'Direct IPC Test',
  },
  chat: {
    emptyState: 'Start chatting with Ollama',
    selectModel: 'Select a model and type a message',
    dragDrop: 'Drop files here',
    clearChat: 'Clear chat',
    attachFile: 'Attach file',
    offline: 'Offline',
  },
  settings: {
    heading: 'Settings',
    generalSettings: 'General Settings',
    appearance: 'Appearance',
    apiEndpoints: 'API Endpoints',
    providerKeys: 'AI Provider API Keys',
    serviceKeys: 'Service API Keys',
    autoSave: 'Settings are automatically saved to local storage.',
    about: 'About',
    version: 'Claude HYDRA v0.1.0',
    themeDark: 'Matrix Dark',
    themeLight: 'Cyber Light',
  },
  memory: {
    heading: 'Agent Memory',
    knowledgeGraph: 'Knowledge Graph',
    noMemories: 'No memories found',
    searchPlaceholder: 'Search memories...',
    refresh: 'Refresh',
    clearMemories: 'Clear memories',
  },
} as const;

// ── Limits ──────────────────────────────────────────────────────────────────────

export const LIMITS = {
  maxOutputLines: 500,
  maxSessions: 100,
  maxMemories: 50,
  maxContentLength: 50000,
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateText(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz ';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function createTestMessage(
  role: 'user' | 'assistant' | 'system',
  content: string
) {
  return {
    id: generateTestId(),
    role,
    content,
    timestamp: new Date(),
  };
}

export function createSwarmAgentMessages() {
  return AGENTS.slice(0, 5).map((agent) => ({
    name: agent.name,
    role: agent.role,
    content: `[${agent.name}] Analysis complete. ${agent.role} findings: OK`,
  }));
}
