import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  Brain,
  ChevronRight,
  Code2,
  Eye,
  EyeOff,
  FileCode,
  FolderOpen,
  Github,
  Globe,
  Key,
  Moon,
  Palette,
  Save,
  Search,
  Shield,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useClaudeStore } from '../stores/claudeStore';

interface ApiKeyInputProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
}

function ApiKeyInput({ label, icon, value, onChange, placeholder, description }: ApiKeyInputProps) {
  const [showKey, setShowKey] = useState(false);
  const hasValue = value.length > 0;

  return (
    <div className="space-y-1">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: label and input are siblings in visual layout */}
      <label className="flex items-center gap-2 text-sm text-matrix-text">
        {icon}
        {label}
        {hasValue && <span className="ml-auto text-xs text-matrix-accent">Configured</span>}
      </label>
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full glass-input pr-10"
          placeholder={placeholder || `Enter ${label}...`}
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-matrix-text-dim hover:text-matrix-accent transition-colors"
        >
          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {description && <p className="text-xs text-matrix-text-dim">{description}</p>}
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <motion.div
      className="glass-panel overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-4 hover:bg-matrix-accent/5 transition-colors"
      >
        {icon}
        <span className="text-sm font-semibold text-matrix-text flex-1 text-left">{title}</span>
        <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronRight size={16} className="text-matrix-text-dim" />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="p-4 pt-0 border-t border-matrix-border space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function SettingsView() {
  const {
    workingDir,
    cliPath,
    apiKeys,
    endpoints,
    theme,
    setWorkingDir,
    setCliPath,
    setApiKey,
    setEndpoint,
    toggleTheme,
  } = useClaudeStore();

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="h-full flex flex-col overflow-auto">
      <h2 className="text-lg font-semibold text-matrix-text mb-4">Settings</h2>

      <div className="space-y-4">
        {/* General Settings */}
        <CollapsibleSection
          title="General Settings"
          icon={<FolderOpen size={18} className="text-matrix-accent" />}
          defaultOpen={true}
        >
          {/* Working Directory */}
          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: visual label with sibling input */}
            <label className="block text-sm text-matrix-text mb-2">
              <FolderOpen size={14} className="inline mr-2" />
              Working Directory
            </label>
            <input
              type="text"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              className="w-full glass-input"
              placeholder="C:\path\to\project"
            />
            <p className="text-xs text-matrix-text-dim mt-1">
              The directory where Claude CLI will execute commands.
            </p>
          </div>

          {/* CLI Path */}
          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: visual label with sibling input */}
            <label className="block text-sm text-matrix-text mb-2">
              <FileCode size={14} className="inline mr-2" />
              Claude CLI Path
            </label>
            <input
              type="text"
              value={cliPath}
              onChange={(e) => setCliPath(e.target.value)}
              className="w-full glass-input"
              placeholder="C:\path\to\cli.js"
            />
            <p className="text-xs text-matrix-text-dim mt-1">
              Path to the Claude Code CLI entry point (cli.js).
            </p>
          </div>
        </CollapsibleSection>

        {/* Appearance */}
        <CollapsibleSection
          title="Appearance"
          icon={<Palette size={18} className="text-pink-400" />}
          defaultOpen={true}
        >
          <div className="space-y-4">
            {/* Theme Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <Moon size={18} className="text-blue-400" />
                ) : (
                  <Sun size={18} className="text-yellow-400" />
                )}
                <div>
                  <p className="text-sm text-matrix-text">Theme</p>
                  <p className="text-xs text-matrix-text-dim">
                    {theme === 'dark' ? 'Matrix Dark' : 'Cyber Light'}
                  </p>
                </div>
              </div>
              <motion.button
                onClick={toggleTheme}
                className="relative w-14 h-7 rounded-full bg-matrix-bg-secondary border border-matrix-border"
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  className="absolute top-0.5 w-6 h-6 rounded-full bg-matrix-accent flex items-center justify-center"
                  animate={{ left: theme === 'dark' ? '2px' : '30px' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                  {theme === 'dark' ? (
                    <Moon size={12} className="text-matrix-bg-primary" />
                  ) : (
                    <Sun size={12} className="text-matrix-bg-primary" />
                  )}
                </motion.div>
              </motion.button>
            </div>
            <p className="text-xs text-matrix-text-dim">
              Switch between Matrix Dark and Cyber Light theme.
            </p>
          </div>
        </CollapsibleSection>

        {/* API Endpoints */}
        <CollapsibleSection
          title="API Endpoints"
          icon={<Globe size={18} className="text-blue-400" />}
          defaultOpen={true}
        >
          <div className="space-y-4">
            <div>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: visual label with sibling input */}
              <label className="flex items-center gap-2 text-sm text-matrix-text mb-2">
                <Bot size={14} />
                Ollama URL
              </label>
              <input
                type="text"
                value={endpoints.ollama}
                onChange={(e) => setEndpoint('ollama', e.target.value)}
                className="w-full glass-input"
                placeholder="http://127.0.0.1:11434"
              />
              <p className="text-xs text-matrix-text-dim mt-1">
                Local Ollama server endpoint for free AI inference.
              </p>
            </div>

            <div>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: visual label with sibling input */}
              <label className="flex items-center gap-2 text-sm text-matrix-text mb-2">
                <Sparkles size={14} />
                Anthropic API URL
              </label>
              <input
                type="text"
                value={endpoints.claudeApi}
                onChange={(e) => setEndpoint('claudeApi', e.target.value)}
                className="w-full glass-input"
                placeholder="https://api.anthropic.com"
              />
              <p className="text-xs text-matrix-text-dim mt-1">
                Claude API endpoint (default: api.anthropic.com).
              </p>
            </div>

            <div>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: visual label with sibling input */}
              <label className="flex items-center gap-2 text-sm text-matrix-text mb-2">
                <Brain size={14} />
                OpenAI API URL
              </label>
              <input
                type="text"
                value={endpoints.openaiApi}
                onChange={(e) => setEndpoint('openaiApi', e.target.value)}
                className="w-full glass-input"
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-xs text-matrix-text-dim mt-1">
                OpenAI API endpoint (or compatible like Azure OpenAI).
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* AI Provider API Keys */}
        <CollapsibleSection
          title="AI Provider API Keys"
          icon={<Key size={18} className="text-yellow-400" />}
        >
          <div className="space-y-4">
            <ApiKeyInput
              label="Anthropic (Claude)"
              icon={<Sparkles size={14} className="text-purple-400" />}
              value={apiKeys.anthropic}
              onChange={(v) => setApiKey('anthropic', v)}
              placeholder="sk-ant-..."
              description="Required for Claude API access."
            />

            <ApiKeyInput
              label="OpenAI"
              icon={<Brain size={14} className="text-emerald-400" />}
              value={apiKeys.openai}
              onChange={(v) => setApiKey('openai', v)}
              placeholder="sk-..."
              description="For GPT-4 fallback."
            />

            <ApiKeyInput
              label="Google (Gemini)"
              icon={<Zap size={14} className="text-blue-400" />}
              value={apiKeys.google}
              onChange={(v) => setApiKey('google', v)}
              placeholder="AIza..."
              description="For Gemini fallback."
            />

            <ApiKeyInput
              label="Mistral"
              icon={<Bot size={14} className="text-orange-400" />}
              value={apiKeys.mistral}
              onChange={(v) => setApiKey('mistral', v)}
              placeholder="..."
              description="For Mistral fallback."
            />

            <ApiKeyInput
              label="Groq"
              icon={<Zap size={14} className="text-red-400" />}
              value={apiKeys.groq}
              onChange={(v) => setApiKey('groq', v)}
              placeholder="gsk_..."
              description="Ultra-fast inference fallback."
            />
          </div>
        </CollapsibleSection>

        {/* Service API Keys */}
        <CollapsibleSection
          title="Service API Keys"
          icon={<Shield size={18} className="text-cyan-400" />}
        >
          <div className="space-y-4">
            <ApiKeyInput
              label="Brave Search"
              icon={<Search size={14} className="text-orange-500" />}
              value={apiKeys.brave}
              onChange={(v) => setApiKey('brave', v)}
              placeholder="BSA..."
              description="For web search MCP server."
            />

            <ApiKeyInput
              label="GitHub PAT"
              icon={<Github size={14} className="text-gray-300" />}
              value={apiKeys.github}
              onChange={(v) => setApiKey('github', v)}
              placeholder="ghp_..."
              description="Personal Access Token for GitHub MCP."
            />

            <ApiKeyInput
              label="Greptile"
              icon={<Code2 size={14} className="text-green-400" />}
              value={apiKeys.greptile}
              onChange={(v) => setApiKey('greptile', v)}
              placeholder="..."
              description="For Greptile code search MCP."
            />
          </div>
        </CollapsibleSection>

        {/* Save Note */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-xs text-matrix-text-dim">
            <Save size={14} />
            <span>Settings are automatically saved to local storage.</span>
          </div>
          <p className="text-xs text-yellow-400/70 mt-2">
            Note: API keys are stored locally. For production use, consider using environment
            variables or a secure vault.
          </p>
        </div>

        {/* Info Section */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-matrix-text mb-2">About</h3>
          <div className="text-xs text-matrix-text-dim space-y-1">
            <p>Claude HYDRA v0.1.0</p>
            <p>AI Swarm Control Center</p>
            <p className="pt-2">
              This GUI allows you to automatically approve or deny actions requested by Claude Code
              based on configurable rules.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
