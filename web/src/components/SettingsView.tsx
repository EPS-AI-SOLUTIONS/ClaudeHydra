'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  Brain,
  ChevronRight,
  Code2,
  Eye,
  EyeOff,
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
import { useClaudeStore } from '@/stores/claudeStore';

// ── Sub-components ──

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
      <label className="flex items-center gap-2 text-sm text-[var(--matrix-text-primary)]">
        {icon}
        {label}
        {hasValue && (
          <span className="ml-auto text-xs text-[var(--matrix-accent)]">Skonfigurowany</span>
        )}
      </label>
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full glass-input pr-10"
          placeholder={placeholder || `Podaj ${label}...`}
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-accent)] transition-colors"
        >
          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {description && <p className="text-xs text-[var(--matrix-text-secondary)]">{description}</p>}
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
        className="w-full flex items-center gap-3 p-4 hover:bg-[var(--matrix-accent)]/5 transition-colors"
      >
        {icon}
        <span className="text-sm font-semibold text-[var(--matrix-text-primary)] flex-1 text-left">
          {title}
        </span>
        <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronRight size={16} className="text-[var(--matrix-text-secondary)]" />
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
            <div className="p-4 pt-0 border-t border-[var(--matrix-border)] space-y-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Component ──

export function SettingsView() {
  const { apiKeys, endpoints, theme, setApiKey, setEndpoint, toggleTheme } = useClaudeStore();

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="h-full flex flex-col overflow-auto p-4">
      <h2 className="text-lg font-semibold text-[var(--matrix-text-primary)] mb-4">Ustawienia</h2>

      <div className="space-y-4">
        {/* Appearance */}
        <CollapsibleSection
          title="Wygląd"
          icon={<Palette size={18} className="text-pink-400" />}
          defaultOpen={true}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <Moon size={18} className="text-blue-400" />
                ) : (
                  <Sun size={18} className="text-yellow-400" />
                )}
                <div>
                  <p className="text-sm text-[var(--matrix-text-primary)]">Motyw</p>
                  <p className="text-xs text-[var(--matrix-text-secondary)]">
                    {theme === 'dark' ? 'Matrix Dark' : 'Cyber Light'}
                  </p>
                </div>
              </div>
              <motion.button
                onClick={toggleTheme}
                className="relative w-14 h-7 rounded-full bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-border)]"
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  className="absolute top-0.5 w-6 h-6 rounded-full bg-[var(--matrix-accent)] flex items-center justify-center"
                  animate={{ left: theme === 'dark' ? '2px' : '30px' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                  {theme === 'dark' ? (
                    <Moon size={12} className="text-[var(--matrix-bg-primary)]" />
                  ) : (
                    <Sun size={12} className="text-[var(--matrix-bg-primary)]" />
                  )}
                </motion.div>
              </motion.button>
            </div>
            <p className="text-xs text-[var(--matrix-text-secondary)]">
              Przełączaj między motywem Matrix Dark i Cyber Light.
            </p>
          </div>
        </CollapsibleSection>

        {/* API Endpoints */}
        <CollapsibleSection
          title="Endpointy API"
          icon={<Globe size={18} className="text-blue-400" />}
          defaultOpen={true}
        >
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm text-[var(--matrix-text-primary)] mb-2">
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
              <p className="text-xs text-[var(--matrix-text-secondary)] mt-1">
                Lokalny serwer Ollama do darmowej inferencji AI.
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-[var(--matrix-text-primary)] mb-2">
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
              <p className="text-xs text-[var(--matrix-text-secondary)] mt-1">
                Endpoint Claude API.
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-[var(--matrix-text-primary)] mb-2">
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
              <p className="text-xs text-[var(--matrix-text-secondary)] mt-1">
                Endpoint OpenAI (lub kompatybilny).
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* AI Provider API Keys */}
        <CollapsibleSection
          title="Klucze API - Dostawcy AI"
          icon={<Key size={18} className="text-yellow-400" />}
        >
          <div className="space-y-4">
            <ApiKeyInput
              label="Anthropic (Claude)"
              icon={<Sparkles size={14} className="text-purple-400" />}
              value={apiKeys.anthropic}
              onChange={(v) => setApiKey('anthropic', v)}
              placeholder="sk-ant-..."
              description="Wymagany do dostępu do Claude API."
            />
            <ApiKeyInput
              label="OpenAI"
              icon={<Brain size={14} className="text-emerald-400" />}
              value={apiKeys.openai}
              onChange={(v) => setApiKey('openai', v)}
              placeholder="sk-..."
              description="Dla GPT-4 fallback."
            />
            <ApiKeyInput
              label="Google (Gemini)"
              icon={<Zap size={14} className="text-blue-400" />}
              value={apiKeys.google}
              onChange={(v) => setApiKey('google', v)}
              placeholder="AIza..."
              description="Dla Gemini fallback."
            />
            <ApiKeyInput
              label="Mistral"
              icon={<Bot size={14} className="text-orange-400" />}
              value={apiKeys.mistral}
              onChange={(v) => setApiKey('mistral', v)}
              placeholder="..."
              description="Dla Mistral fallback."
            />
            <ApiKeyInput
              label="Groq"
              icon={<Zap size={14} className="text-red-400" />}
              value={apiKeys.groq}
              onChange={(v) => setApiKey('groq', v)}
              placeholder="gsk_..."
              description="Ultra-szybka inferencja."
            />
          </div>
        </CollapsibleSection>

        {/* Service API Keys */}
        <CollapsibleSection
          title="Klucze API - Usługi"
          icon={<Shield size={18} className="text-cyan-400" />}
        >
          <div className="space-y-4">
            <ApiKeyInput
              label="Brave Search"
              icon={<Search size={14} className="text-orange-500" />}
              value={apiKeys.brave}
              onChange={(v) => setApiKey('brave', v)}
              placeholder="BSA..."
              description="Dla serwera MCP wyszukiwania."
            />
            <ApiKeyInput
              label="GitHub PAT"
              icon={<Github size={14} className="text-gray-300" />}
              value={apiKeys.github}
              onChange={(v) => setApiKey('github', v)}
              placeholder="ghp_..."
              description="Personal Access Token dla GitHub MCP."
            />
            <ApiKeyInput
              label="Greptile"
              icon={<Code2 size={14} className="text-green-400" />}
              value={apiKeys.greptile}
              onChange={(v) => setApiKey('greptile', v)}
              placeholder="..."
              description="Dla Greptile code search MCP."
            />
          </div>
        </CollapsibleSection>

        {/* Save Note */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--matrix-text-secondary)]">
            <Save size={14} />
            <span>Ustawienia są automatycznie zapisywane w localStorage.</span>
          </div>
          <p className="text-xs text-yellow-400/70 mt-2">
            Uwaga: Klucze API są przechowywane lokalnie. W środowisku produkcyjnym rozważ użycie
            zmiennych środowiskowych.
          </p>
        </div>

        {/* Info */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-[var(--matrix-text-primary)] mb-2">
            O aplikacji
          </h3>
          <div className="text-xs text-[var(--matrix-text-secondary)] space-y-1">
            <p>ClaudeHydra v3.0.0 Web Edition</p>
            <p>Hybrid MCP Server with AI Agent Swarm</p>
          </div>
        </div>
      </div>
    </div>
  );
}
