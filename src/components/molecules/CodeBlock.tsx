// src/components/molecules/CodeBlock.tsx
/**
 * CodeBlock Molecule
 * ==================
 * Syntax-highlighted code display with copy-to-clipboard, language badge,
 * optional line numbers, and glass-panel wrapper.
 *
 * Uses `hljs` CSS classes for syntax highlighting — works with rehype-highlight
 * when rendered inside react-markdown, and displays cleanly as plain code standalone.
 *
 * ClaudeHydra-v4: Green Matrix accent with glass-panel from globals.css.
 */

import { cn } from '@jaskier/ui';
import { Check, Clipboard, Maximize2, Terminal } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { copyToClipboard } from '@/shared/utils/clipboard';
import { useViewStore } from '@/stores/viewStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CodeBlockProps {
  /** The code string to display. */
  code: string;
  /** Language identifier (e.g. 'typescript', 'python'). */
  language?: string;
  /** Show line numbers. Defaults to `false`. */
  showLineNumbers?: boolean;
  /** Maximum height before scrolling. Defaults to '24rem'. */
  maxHeight?: string;
  /** Extra CSS class on the root wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Language display names
// ---------------------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  jsx: 'JSX',
  py: 'Python',
  python: 'Python',
  rs: 'Rust',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  cs: 'C#',
  csharp: 'C#',
  rb: 'Ruby',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kt: 'Kotlin',
  kotlin: 'Kotlin',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  xml: 'XML',
  md: 'Markdown',
  markdown: 'Markdown',
  sql: 'SQL',
  sh: 'Shell',
  shell: 'Shell',
  bash: 'Bash',
  powershell: 'PowerShell',
  dockerfile: 'Dockerfile',
  toml: 'TOML',
};

// ---------------------------------------------------------------------------
// Auto-open tracking
// ---------------------------------------------------------------------------
const autoOpenedArtifacts = new Set<string>();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CodeBlock = memo(function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  maxHeight = '24rem',
  className,
}: CodeBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const lang = language?.toLowerCase() ?? '';
  const displayName = LANGUAGE_NAMES[lang] ?? (lang ? lang.toUpperCase() : 'Code');

  const setActiveArtifact = useViewStore((s) => s.setActiveArtifact);

  // Split into lines for line-number rendering
  const lines = useMemo(() => code.split('\n'), [code]);

  // ----- Auto-open large artifacts -------------------------------------
  const isArtifactLanguage = [
    'html',
    'css',
    'javascript',
    'typescript',
    'tsx',
    'jsx',
    'json',
    'yaml',
    'mermaid',
    'svg',
    'python',
    'rust',
    'go',
  ].includes(lang);

  useEffect(() => {
    if (isArtifactLanguage && lines.length >= 15 && code.length > 300) {
      // Create a hash/id to track if we've already opened this exact block
      const artifactId = code.substring(0, 100).replace(/\s/g, '');
      if (!autoOpenedArtifacts.has(artifactId)) {
        autoOpenedArtifacts.add(artifactId);
        setActiveArtifact({ id: artifactId, code, language: lang, title: 'Generated Artifact' });
      } else {
        // Update it live if it's currently active (streaming)
        const currentActive = useViewStore.getState().activeArtifact;
        if (currentActive?.id === artifactId) {
          setActiveArtifact({ id: artifactId, code, language: lang, title: 'Generated Artifact' });
        }
      }
    }
  }, [code, isArtifactLanguage, lines.length, lang, setActiveArtifact]);

  // ----- Copy to clipboard ---------------------------------------------

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  // ----- Render --------------------------------------------------------

  return (
    <div className={cn('glass-panel overflow-hidden my-3 group', className)}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--glass-border)] bg-[var(--matrix-bg-secondary)]/50">
        {/* Language icon + label */}
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-[var(--matrix-accent)]" />
          <span className="text-xs font-mono text-[var(--matrix-text-secondary)] uppercase tracking-wider">
            {displayName}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Artifact button */}
          {isArtifactLanguage && lines.length >= 5 && (
            <button
              type="button"
              onClick={() =>
                setActiveArtifact({ id: code.substring(0, 50), code, language: lang, title: 'Code Artifact' })
              }
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono transition-colors',
                'text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-accent)] hover:bg-[var(--matrix-accent)]/10',
              )}
              title="Open in Side Panel"
            >
              <Maximize2 size={14} />
              Open Panel
            </button>
          )}

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono transition-colors',
              'text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-accent)] hover:bg-[var(--matrix-accent)]/10',
            )}
            aria-label={copied ? t('common.copied') : t('common.copyCode')}
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-1 text-[var(--matrix-success)]"
                >
                  <Check size={14} />
                  {t('common.copied')}
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-1"
                >
                  <Clipboard size={14} />
                  {t('common.copy')}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* Code content */}
      <div className="overflow-auto" style={{ maxHeight }}>
        <pre
          ref={preRef}
          className={cn(
            'm-0 p-4 bg-transparent text-sm leading-relaxed',
            'font-mono text-[var(--matrix-text-primary)]',
            showLineNumbers && 'flex',
          )}
        >
          {/* Line numbers gutter */}
          {showLineNumbers && (
            <div
              className="select-none pr-4 mr-4 border-r border-[var(--glass-border)] text-right text-[var(--matrix-text-secondary)]"
              aria-hidden="true"
            >
              {lines.map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Line numbers are static, never reordered
                <div key={i} className="leading-relaxed">
                  {i + 1}
                </div>
              ))}
            </div>
          )}

          {/* Code body */}
          <code className={cn(lang && `language-${lang}`, 'block flex-1')}>{code}</code>
        </pre>
      </div>
    </div>
  );
});
