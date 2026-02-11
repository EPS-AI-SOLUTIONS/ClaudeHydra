import { invoke } from '@tauri-apps/api/core';
import {
  Check,
  Copy,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  Terminal,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

// Language to file extension mapping
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
  scala: 'scala',
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

// Languages that can be executed
const RUNNABLE_LANGUAGES = ['javascript', 'js', 'typescript', 'ts', 'python', 'py'];

// Language display names
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
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Normalize language
  const lang = language?.toLowerCase() || '';
  const displayName = LANGUAGE_NAMES[lang] || lang.toUpperCase() || 'Code';
  const extension = LANGUAGE_EXTENSIONS[lang] || 'txt';
  const isRunnable = RUNNABLE_LANGUAGES.includes(lang);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [code]);

  // Save to file
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

  // Run code
  const handleRun = useCallback(async () => {
    if (!isRunnable) return;

    setIsRunning(true);
    setOutput(null);
    setError(null);

    try {
      let command: string;
      let args: string[];

      if (lang === 'python' || lang === 'py') {
        // Python execution
        command = 'python';
        args = ['-c', code];
      } else if (lang === 'javascript' || lang === 'js') {
        // Node.js execution
        command = 'node';
        args = ['-e', code];
      } else if (lang === 'typescript' || lang === 'ts') {
        // TypeScript via ts-node or npx tsx
        command = 'npx';
        args = ['tsx', '-e', code];
      } else {
        throw new Error(`Unsupported language: ${lang}`);
      }

      // Execute via Tauri command (safe_mode: false allows code execution)
      const result = await invoke<{ stdout: string; stderr: string }>('execute_command', {
        command: `${command} ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`,
        safeMode: false,
      });

      setOutput(result.stdout || result.stderr || '(No output)');
    } catch (err) {
      setError(String(err));
    } finally {
      setIsRunning(false);
    }
  }, [code, lang, isRunnable]);

  // Clear output
  const handleClearOutput = useCallback(() => {
    setOutput(null);
    setError(null);
  }, []);

  return (
    <div className="relative group my-3">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-matrix-bg-primary/80 px-3 py-1.5 rounded-t-lg border-b border-matrix-accent/20">
        {/* Language badge */}
        <div className="flex items-center gap-2">
          <Terminal size={12} className="text-matrix-accent" />
          <span className="text-[10px] font-mono text-matrix-text-dim">{displayName}</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {/* Run button (only for runnable languages) */}
          {isRunnable && (
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded hover:bg-green-500/20 text-green-400 transition-colors disabled:opacity-50"
              title={`Run ${displayName}`}
            >
              {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              Run
            </button>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
            title={`Save as .${extension}`}
          >
            <Download size={12} />
            Save
          </button>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded hover:bg-matrix-accent/20 text-matrix-accent transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>

          {/* Expand/collapse for long code */}
          {code.split('\n').length > 15 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded hover:bg-matrix-accent/20 text-matrix-text-dim transition-colors"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Code content */}
      <pre
        className={`bg-matrix-bg-primary p-3 rounded-b-lg overflow-x-auto ${
          !expanded && code.split('\n').length > 15 ? 'max-h-[300px]' : ''
        } ${output || error ? 'rounded-b-none' : ''}`}
      >
        <code className={className}>{code}</code>
      </pre>

      {/* Output/Error panel */}
      {(output || error) && (
        <div className="bg-matrix-bg-secondary border-t border-matrix-accent/20 rounded-b-lg">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-matrix-accent/10">
            <span className="text-[10px] font-semibold text-matrix-text-dim">
              {error ? 'Error' : 'Output'}
            </span>
            <button
              onClick={handleClearOutput}
              className="text-matrix-text-dim hover:text-matrix-accent transition-colors"
              title="Clear output"
            >
              <X size={12} />
            </button>
          </div>
          <pre
            className={`p-3 text-xs overflow-x-auto max-h-[200px] ${
              error ? 'text-red-400' : 'text-green-400'
            }`}
          >
            {error || output}
          </pre>
        </div>
      )}

      {/* Line count indicator for collapsed code */}
      {!expanded && code.split('\n').length > 15 && (
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-matrix-bg-primary to-transparent pointer-events-none flex items-end justify-center pb-1">
          <span className="text-[10px] text-matrix-text-dim bg-matrix-bg-primary/80 px-2 py-0.5 rounded">
            {code.split('\n').length} lines
          </span>
        </div>
      )}
    </div>
  );
}

// Inline code component (no actions, just styling)
export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 bg-matrix-bg-primary rounded text-matrix-accent text-sm font-mono">
      {children}
    </code>
  );
}
