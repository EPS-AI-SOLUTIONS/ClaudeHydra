'use client';

import { Check, Copy, Download, Maximize2, Minimize2, Terminal, X } from 'lucide-react';
import { useCallback, useState } from 'react';

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  rust: 'rs',
  go: 'go',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  csharp: 'cs',
  ruby: 'rb',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  yaml: 'yaml',
  yml: 'yml',
  xml: 'xml',
  markdown: 'md',
  sql: 'sql',
  shell: 'sh',
  bash: 'sh',
  powershell: 'ps1',
  dockerfile: 'dockerfile',
  toml: 'toml',
};

const LANGUAGE_NAMES: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
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
  ps1: 'PowerShell',
  powershell: 'PowerShell',
  dockerfile: 'Dockerfile',
  toml: 'TOML',
};

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const lang = language?.toLowerCase() || '';
  const displayName = LANGUAGE_NAMES[lang] || lang.toUpperCase() || 'Code';
  const extension = LANGUAGE_EXTENSIONS[lang] || 'txt';

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [code]);

  const handleSave = useCallback(() => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `code_${Date.now()}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [code, extension]);

  return (
    <div className="relative group my-3">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-[var(--matrix-bg-primary)]/80 px-3 py-1.5 rounded-t-lg border-b border-[var(--matrix-accent)]/20">
        <div className="flex items-center gap-2">
          <Terminal size={12} className="text-[var(--matrix-accent)]" />
          <span className="text-[10px] font-mono text-[var(--matrix-text-secondary)]">
            {displayName}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleSave}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
            title={`Zapisz jako .${extension}`}
          >
            <Download size={12} />
            Zapisz
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded hover:bg-[var(--matrix-accent)]/20 text-[var(--matrix-accent)] transition-colors"
            title="Kopiuj do schowka"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Skopiowano!' : 'Kopiuj'}
          </button>

          {code.split('\n').length > 15 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded hover:bg-[var(--matrix-accent)]/20 text-[var(--matrix-text-secondary)] transition-colors"
              title={expanded ? 'Zwiń' : 'Rozwiń'}
            >
              {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Code content */}
      <pre
        className={`bg-[var(--matrix-bg-primary)] p-3 rounded-b-lg overflow-x-auto ${
          !expanded && code.split('\n').length > 15 ? 'max-h-[300px]' : ''
        }`}
      >
        <code className={className}>{code}</code>
      </pre>

      {/* Line count indicator */}
      {!expanded && code.split('\n').length > 15 && (
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--matrix-bg-primary)] to-transparent pointer-events-none flex items-end justify-center pb-1">
          <span className="text-[10px] text-[var(--matrix-text-secondary)] bg-[var(--matrix-bg-primary)]/80 px-2 py-0.5 rounded">
            {code.split('\n').length} linii
          </span>
        </div>
      )}
    </div>
  );
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 bg-[var(--matrix-bg-primary)] rounded text-[var(--matrix-accent)] text-sm font-mono">
      {children}
    </code>
  );
}
