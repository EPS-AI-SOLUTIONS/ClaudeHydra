/**
 * create-shims.js — Create stub @jaskier/* packages for Vercel deployment.
 *
 * On Vercel, the app is deployed from its own repo (not the monorepo),
 * so workspace:* dependencies can't resolve. This script creates minimal
 * shim packages in node_modules so that the build can proceed.
 *
 * Shimmed packages: @jaskier/ui, @jaskier/core, @jaskier/hydra-app,
 *   @jaskier/auth, @jaskier/state, @jaskier/chat-module,
 *   @jaskier/vault-client, @jaskier/wasm-worker, @jaskier/i18n
 */

import fs from "fs";
import path from "path";

const basePath = path.join(process.cwd(), "node_modules");

/** Create a shim package with the given name, exports map, and index code. */
function createShim(name, indexCode, subpaths = {}) {
  const dir = path.join(basePath, name);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Main index.js
  fs.writeFileSync(path.join(dir, "index.js"), indexCode);

  // package.json with exports map
  const exports = { ".": "./index.js" };
  for (const [subpath, file] of Object.entries(subpaths)) {
    exports[subpath] = `./${file}`;
  }

  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        main: "index.js",
        type: "module",
        exports,
      },
      null,
      2,
    ),
  );

  // Create subpath files
  for (const [, file] of Object.entries(subpaths)) {
    const filePath = path.join(dir, file);
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "export {};\n");
    }
  }

  console.log(`Shim created: ${name}`);
}

// ── @jaskier/ui ──
createShim(
  "@jaskier/ui",
  `export const cn = (...args) => args.filter(Boolean).join(' ');
export const Button = () => null;
export const Input = () => null;
export const Card = () => null;
export const Badge = () => null;
export const Skeleton = () => null;
export const AgentAvatar = () => null;
export const BaseArtifactView = () => null;
export const BaseChatInput = () => null;
export const BaseMetricsDashboard = () => null;
export const CommandPalette = () => null;
export const EmptyState = () => null;
export const FooterControls = () => null;
export const LogoButton = () => null;
export const RuneRain = () => null;
export const SessionItem = () => null;
export const SessionSearch = () => null;
export const TabBar = () => null;
export const ThemedBackground = () => null;
export const ViewSkeleton = () => null;
export const ThemeContext = null;
export const ThemeProvider = ({ children }) => children;
export const useTheme = () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme: () => {} });
export class ErrorBoundary { constructor(p) { this.props = p; } render() { return this.props.children; } }
`,
  {
    "./markdown": "markdown/index.js",
  },
);

// Write stub for @jaskier/ui/markdown subpath
fs.writeFileSync(
  path.join(basePath, "@jaskier/ui/markdown/index.js"),
  `export const BaseMessageBubble = () => null;
export const BaseCodeBlock = () => null;
export const MarkdownRenderer = () => null;
export {};
`,
);

// ── @jaskier/core ──
const coreIndex = `export const cn = (...args) => args.filter(Boolean).join(' ');
export const fnv1a32 = (s) => 0;
export const processMarkdownSync = (md) => md;
export const chatLanguages = {};
export const formatDate = (d) => String(d);
export const formatDateTime = (d) => String(d);
export const formatNumber = (n) => String(n);
export const formatTime = (d) => String(d);
export const getLocale = () => 'pl';
export const copyToClipboard = async () => {};
export const readFileAsDataUrl = async () => '';
export const readFileAsText = async () => '';
export const useFocusTrap = () => ({});
export const useDebounce = (v) => v;
export const useIsMobile = () => false;
export const useAuthStatus = () => ({ phase: 'idle', isAuthenticated: false });
export const useSettingsQuery = () => ({ data: {}, isLoading: false });
export const createTelemetryChecker = () => ({ isEnabled: () => false });
export const useCompletionFeedback = () => {};
export const useOnlineStatus = () => true;
export const useCompletionSound = () => ({ play: () => {}, settings: {} });
export const CompletionSoundPreview = () => null;
export const getCompletionVolume = () => 0.5;
export const isCompletionSoundEnabled = () => false;
export const setCompletionSoundEnabled = () => {};
export const setCompletionVolume = () => {};
export {};
`;

createShim("@jaskier/core", coreIndex, {
  "./api": "api/index.js",
  "./hooks": "hooks/index.js",
  "./utils": "utils/index.js",
  "./types": "types/index.js",
  "./schemas": "schemas.js",
  "./i18n": "i18n/index.js",
  "./telemetry": "telemetry.js",
  "./vite": "vite/index.js",
});

// Write meaningful stubs for subpaths used by Hydras
fs.writeFileSync(
  path.join(basePath, "@jaskier/core/api/index.js"),
  `import { createContext, useContext } from 'react';
const Ctx = createContext(null);
export const ApiClientProvider = ({ children }) => children;
export const useApiClient = () => ({});
export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/core/i18n/index.js"),
  `export const createI18nConfig = () => ({});
export {};
`,
);

// ── @jaskier/hydra-app ──
const noop = "() => null";
const hydraIndex = `export const AppShell = ${noop};
export const Sidebar = ${noop};
export const StatusFooter = ${noop};
export const TabBar = ${noop};
export const CommandPalette = ${noop};
export const fetchPartnerSessions = async () => [];
export const fetchPartnerSession = async () => null;
export {};
`;

const hydraSubpaths = {
  "./features/chat": "features/chat/index.js",
  "./features/settings": "features/settings/index.js",
  "./features/agents": "features/agents/index.js",
  "./features/auth": "features/auth/index.js",
  "./features/delegations": "features/delegations/index.js",
  "./features/health": "features/health/index.js",
  "./features/home": "features/home/index.js",
  "./features/logs": "features/logs/index.js",
  "./features/memory": "features/memory/index.js",
  "./features/restore": "features/restore/index.js",
  "./features/results": "features/results/index.js",
  "./features/upload": "features/upload/index.js",
  "./features/crop": "features/crop/index.js",
  "./components/molecules": "components/molecules/index.js",
  "./components/organisms": "components/organisms/index.js",
  "./stores": "stores/index.js",
  "./shared/api": "shared/api/client.js",
  "./shared/api/queryClient": "shared/api/queryClient.js",
  "./shared/api/sseClient": "shared/api/sseClient.js",
  "./shared/api/schemas": "shared/api/schemas.js",
  "./shared/hooks": "shared/hooks/index.js",
  "./shared/types": "shared/types/index.js",
  "./contexts/ThemeContext": "contexts/ThemeContext.js",
  "./contexts/HydraAppConfig": "contexts/HydraAppConfig.js",
};

createShim("@jaskier/hydra-app", hydraIndex, hydraSubpaths);

// Write richer stubs for heavily-used subpaths
const featureStub = (exports) =>
  exports.map((e) => `export const ${e} = () => null;`).join("\n") + "\nexport {};\n";

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/chat/index.js"),
  featureStub(["ChatContainer", "ChatViewWrapper", "PartnerChatModal"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/settings/index.js"),
  featureStub(["SettingsView", "OAuthBanner"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/agents/index.js"),
  featureStub(["AgentsView"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/auth/index.js"),
  featureStub(["LoginView"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/delegations/index.js"),
  featureStub(["DelegationsView"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/health/index.js"),
  featureStub(["ProviderHealthWidget"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/home/index.js"),
  featureStub(["WelcomeScreen"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/logs/index.js"),
  featureStub(["LogsView"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/memory/index.js"),
  featureStub(["KnowledgeGraphView"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/upload/index.js"),
  featureStub(["UploadView"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/components/molecules/index.js"),
  featureStub(["FeatureErrorFallback", "QueryError", "SessionSearch", "ViewSkeleton"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/components/organisms/index.js"),
  featureStub(["AppShell", "Sidebar", "StatusFooter", "TabBar", "FooterControls", "LogoButton"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/stores/index.js"),
  `export const useViewStore = () => ({});
export const useCurrentChatHistory = () => [];
export const useCurrentSession = () => null;
export const useCurrentSessionId = () => null;
export const useLiveLogStore = () => ({});
export const createChatSlice = () => ({});
export const createSessionSlice = () => ({});
export const createViewSlice = () => ({});
export const initViewStore = () => {};
export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/shared/api/client.js"),
  `export const initApiClient = () => ({});
export const BASE_URL = '';
export const getBaseUrl = () => '';
export const apiGet = async () => ({});
export const apiPost = async () => ({});
export const apiPatch = async () => ({});
export const apiDelete = async () => ({});
export const apiGetPolling = async () => ({});
export const apiPostFormData = async () => ({});
export const checkHealth = async () => ({});
export class ApiError extends Error { constructor(m) { super(m); } }
export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/shared/api/queryClient.js"),
  `export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/shared/api/schemas.js"),
  `export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/shared/hooks/index.js"),
  `export const useAuthGate = () => ({ isAuthenticated: true, isLoading: false });
export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/shared/types/index.js"),
  `export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/contexts/HydraAppConfig.js"),
  `import { createContext, useContext } from 'react';
const Ctx = createContext({});
export const HydraAppConfigProvider = ({ children }) => children;
export const useHydraAppConfig = () => useContext(Ctx);
export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/contexts/ThemeContext.js"),
  `export {};
`,
);

// ── @jaskier/auth ──
createShim("@jaskier/auth", `export const AuthProvider = ({ children }) => children;
export const useAuth = () => ({ user: null, isAuthenticated: false, isLoading: false, login: () => {}, logout: () => {} });
export const LoginView = () => null;
export const ProtectedRoute = ({ children }) => children;
export const credentialToJSON = (c) => c;
export const parseRequestOptionsFromJSON = (o) => o;
export {};
`);

// ── @jaskier/state ──
createShim("@jaskier/state", `export const createAppStore = (fn) => fn;
export const useAppStore = () => ({});
export {};
`);

// ── @jaskier/chat-module ──
createShim("@jaskier/chat-module", `export const ChatView = () => null;
export const ChatInput = () => null;
export const MessageList = () => null;
export const OfflineBanner = () => null;
export const ChatViewThemeProvider = ({ children }) => children;
export const useChatSession = () => ({});
export const useViewTheme = () => ({ isDark: true, theme: 'dark' });
export const useWebSocketChat = () => ({ send: () => {}, status: 'closed' });
export const splitToolOutput = (text) => [{ type: 'text', content: text }];
export const stripParallelHeader = (text) => text;
export const MAX_RECONNECT_ATTEMPTS = 5;
export {};
`);

// ── @jaskier/vault-client ──
createShim("@jaskier/vault-client", `export const VaultClient = class { async get() { return null; } };
export const useVault = () => ({ status: 'disconnected' });
export const VAULT_API = { HEALTH: '/api/vault/health', NAMESPACES: '/api/vault/namespaces', AUDIT: '/api/vault/audit' };
export const VAULT_POLLING = { HEALTH: 30000, AUDIT: 60000 };
export const VAULT_QUERY_KEYS = { health: ['vault-health'], namespaces: ['vault-namespaces'], audit: ['vault-audit'] };
export const VAULT_DASHBOARD_URL = 'http://localhost:5190';
export const VAULT_STATUS_CONFIG = {};
export const resolveVaultStatus = () => ({ label: 'Unknown', color: 'gray' });
export const vaultFormatDate = (d) => d;
export const vaultStatusColor = () => 'green';
export {};
`);

// ── @jaskier/wasm-worker ──
createShim("@jaskier/wasm-worker", `export const useWasmWorker = () => ({ isReady: false, maskPii: async (t) => t, countTokens: async () => 0 });
export const WasmClient = class { constructor() {} async init() {} async maskPii(t) { return { masked: t, count: 0 }; } async countTokens() { return 0; } };
export const clearWasmCache = async () => {};
export const getWasmCacheInfo = async () => ({ cached: false, size: 0 });
export {};
`);

// ── @jaskier/i18n ──
createShim("@jaskier/i18n", `export const createI18nConfig = () => ({});
export const initI18n = () => ({});
export const useTranslation = () => ({ t: (k) => k, i18n: { language: 'pl', changeLanguage: () => {} } });
const i18n = { t: (k) => k, language: 'pl', changeLanguage: () => {} };
export default i18n;
export {};
`);

console.log("All @jaskier/* shims created successfully.");
