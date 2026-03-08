/**
 * ToolCallBlock — Collapsible panel showing a tool invocation and its result.
 * Styled to match CodeBlock glass-panel aesthetic.
 */

import { AlertCircle, Check, ChevronDown, FileSearch, FolderOpen, Loader2, Pencil, Users, Wrench } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CodeBlock } from '@/components/molecules/CodeBlock';
import { cn } from '@/shared/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolInteraction {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  status: 'pending' | 'running' | 'completed' | 'error';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOOL_ICONS: Record<string, typeof Wrench> = {
  read_file: FileSearch,
  list_directory: FolderOpen,
  write_file: Pencil,
  search_in_files: FileSearch,
  call_agent: Users,
};

const TOOL_LABELS: Record<string, string> = {
  read_file: 'Read File',
  list_directory: 'List Directory',
  write_file: 'Write File',
  search_in_files: 'Search Files',
  call_agent: 'Agent Delegation',
};

const AGENT_NAMES: Record<string, string> = {
  geralt: 'Geralt (Security)',
  yennefer: 'Yennefer (Architecture)',
  vesemir: 'Vesemir (Testing)',
  triss: 'Triss (Data)',
  jaskier: 'Jaskier (Docs)',
  ciri: 'Ciri (Performance)',
  dijkstra: 'Dijkstra (Strategy)',
  lambert: 'Lambert (DevOps)',
  eskel: 'Eskel (Backend)',
  regis: 'Regis (Research)',
  zoltan: 'Zoltan (Frontend)',
  philippa: 'Philippa (Monitoring)',
};

function StatusIcon({ status }: { status: ToolInteraction['status'] }) {
  switch (status) {
    case 'pending':
    case 'running':
      return <Loader2 size={14} className="animate-spin text-[var(--matrix-accent)]" />;
    case 'completed':
      return <Check size={14} className="text-[var(--matrix-success,#22c55e)]" />;
    case 'error':
      return <AlertCircle size={14} className="text-[var(--matrix-error,#ef4444)]" />;
  }
}

function formatInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.length > 120) {
      parts.push(`${key}: "${value.slice(0, 120)}…"`);
    } else {
      parts.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ToolCallBlock({ interaction }: { interaction: ToolInteraction }) {
  const { t } = useTranslation();
  const isActive = interaction.status === 'pending' || interaction.status === 'running';
  const hasError = interaction.status === 'error' || interaction.isError;
  const isAgentCall = interaction.toolName === 'call_agent';

  const [expanded, setExpanded] = useState(isActive || hasError);

  const Icon = TOOL_ICONS[interaction.toolName] ?? Wrench;
  const agentName = isAgentCall ? ((interaction.toolInput.agent_name as string)?.toLowerCase() ?? '') : '';
  const label = isAgentCall
    ? `Delegating to ${AGENT_NAMES[agentName] ?? agentName}`
    : (TOOL_LABELS[interaction.toolName] ?? interaction.toolName);

  const resultLooksLikeCode =
    interaction.result && (interaction.result.includes('\n') || interaction.result.length > 200);

  return (
    <div
      className={cn(
        'glass-panel overflow-hidden my-2 border',
        hasError
          ? 'border-[var(--matrix-error,#ef4444)]/30'
          : isAgentCall
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-[var(--matrix-accent)]/20',
      )}
    >
      {/* Header — clickable toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
          'hover:bg-[var(--matrix-accent)]/5',
          'bg-[var(--matrix-bg-secondary)]/50',
        )}
      >
        <Icon size={14} className="text-[var(--matrix-accent)] shrink-0" />
        <span className="text-xs font-semibold text-[var(--matrix-text-primary)] font-mono">{label}</span>
        <span className="text-[10px] text-[var(--matrix-text-secondary)] truncate flex-1">
          {isAgentCall
            ? ((interaction.toolInput.task as string)?.slice(0, 120) ?? '')
            : formatInput(interaction.toolInput)}
        </span>
        <StatusIcon status={interaction.status} />
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} className="text-[var(--matrix-text-secondary)]" />
        </motion.div>
      </button>

      {/* Body — collapsible */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 border-t border-[var(--glass-border)] space-y-2">
              {/* Input params */}
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--matrix-text-secondary)] font-mono">
                  {t('tools.input')}
                </span>
                <pre className="mt-1 text-xs text-[var(--matrix-text-primary)] font-mono bg-[var(--matrix-bg-primary)]/50 rounded p-2 overflow-x-auto max-h-32">
                  {JSON.stringify(interaction.toolInput, null, 2)}
                </pre>
              </div>

              {/* Result */}
              {interaction.result !== undefined && (
                <div>
                  <span
                    className={cn(
                      'text-[10px] uppercase tracking-wider font-mono',
                      hasError ? 'text-[var(--matrix-error,#ef4444)]' : 'text-[var(--matrix-text-secondary)]',
                    )}
                  >
                    {hasError ? t('tools.error') : t('tools.result')}
                  </span>
                  {resultLooksLikeCode ? (
                    <CodeBlock code={interaction.result} language="text" maxHeight="16rem" className="mt-1" />
                  ) : (
                    <pre
                      className={cn(
                        'mt-1 text-xs font-mono rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap',
                        hasError
                          ? 'text-[var(--matrix-error,#ef4444)] bg-[var(--matrix-error,#ef4444)]/5'
                          : 'text-[var(--matrix-text-primary)] bg-[var(--matrix-bg-primary)]/50',
                      )}
                    >
                      {interaction.result}
                    </pre>
                  )}
                </div>
              )}

              {/* Loading placeholder */}
              {isActive && interaction.result === undefined && (
                <div className="flex items-center gap-2 py-2 text-xs text-[var(--matrix-text-secondary)]">
                  <Loader2 size={12} className="animate-spin" />
                  <span>{t('tools.executing')}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
