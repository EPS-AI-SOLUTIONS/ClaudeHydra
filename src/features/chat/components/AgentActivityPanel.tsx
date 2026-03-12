// src/features/chat/components/AgentActivityPanel.tsx
/**
 * AgentActivityPanel — Live agent activity feed
 * ================================================
 * Shows real-time plan steps, tool calls (in-progress/completed),
 * and execution metadata during streaming. Collapses when idle.
 */

import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { CheckCircle2, ChevronDown, ChevronUp, Cog, Loader2, Target, Wrench, XCircle, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolActivity {
  name: string;
  args?: unknown;
  iteration: number;
  status: 'running' | 'success' | 'error';
  summary?: string;
  startedAt: number;
  completedAt?: number;
}

export interface AgentActivity {
  agent: string | null;
  model: string | null;
  confidence: number | null;
  planSteps: string[];
  tools: ToolActivity[];
  isActive: boolean;
}

export const EMPTY_ACTIVITY: AgentActivity = {
  agent: null,
  model: null,
  confidence: null,
  planSteps: [],
  tools: [],
  isActive: false,
};

// ============================================================================
// CONFIDENCE HELPERS (#45)
// ============================================================================

function confidenceColor(confidence: number): string {
  if (confidence >= 0.7) return 'text-emerald-400';
  if (confidence >= 0.5) return 'text-amber-400';
  return 'text-red-400';
}

function confidenceBgColor(confidence: number): string {
  if (confidence >= 0.7) return 'bg-emerald-500/20';
  if (confidence >= 0.5) return 'bg-amber-500/20';
  return 'bg-red-500/20';
}

function confidenceLabel(confidence: number, t: (key: string) => string): string {
  if (confidence >= 0.7) return t('chat.highConfidence');
  if (confidence >= 0.5) return t('chat.mediumConfidence');
  return t('chat.lowConfidence');
}

// ============================================================================
// COMPONENT
// ============================================================================

export const AgentActivityPanel = memo<{ activity: AgentActivity }>(({ activity }) => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const [expanded, setExpanded] = useState(true);

  const toggleExpanded = useCallback(() => setExpanded((p) => !p), []);

  // Auto-collapse when streaming finishes
  useEffect(() => {
    if (!activity.isActive) setExpanded(false);
  }, [activity.isActive]);

  const runningTools = useMemo(() => activity.tools.filter((t) => t.status === 'running'), [activity.tools]);
  const completedTools = useMemo(() => activity.tools.filter((t) => t.status !== 'running'), [activity.tools]);
  const lastTool = activity.tools[activity.tools.length - 1] ?? null;

  // Memoized plan steps list (#5)
  const planStepsList = useMemo(
    () =>
      activity.planSteps.map((step, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: plan steps are append-only and have no stable ID
        <div key={`step-${i}`} className="flex items-start gap-2">
          <Target size={14} className={cn('mt-0.5 shrink-0', theme.accentText, 'opacity-50')} />
          <span className={theme.textMuted}>{step}</span>
        </div>
      )),
    [activity.planSteps, theme.accentText, theme.textMuted],
  );

  // Memoized tool rows list (#5)
  const toolRowsList = useMemo(
    () =>
      activity.tools.map((tool) => <ToolRow key={`tool-${tool.iteration}-${tool.name}`} tool={tool} theme={theme} />),
    [activity.tools, theme],
  );

  // Don't render when there's nothing to show
  if (!activity.isActive && activity.tools.length === 0 && activity.planSteps.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'shrink-0 rounded-xl overflow-hidden font-mono text-sm',
        theme.isLight
          ? 'bg-emerald-500/5 border border-emerald-500/15'
          : 'bg-[var(--matrix-accent)]/5 border border-[var(--matrix-accent)]/15',
      )}
    >
      {/* Header bar — always visible */}
      <button
        type="button"
        onClick={toggleExpanded}
        className={cn(
          'w-full flex items-center gap-2 px-4 py-2 transition-colors',
          theme.isLight ? 'hover:bg-emerald-500/10' : 'hover:bg-[var(--matrix-accent)]/10',
        )}
      >
        {activity.isActive ? (
          <Loader2 size={16} className={cn(theme.accentText, 'animate-spin')} />
        ) : (
          <Zap size={16} className={theme.accentText} />
        )}

        {/* Agent + model (hidden when collapsed to save space) */}
        {expanded && activity.agent && <span className={cn('font-bold', theme.accentText)}>{activity.agent}</span>}
        {expanded && activity.model && <span className={cn('opacity-50', theme.textMuted)}>· {activity.model}</span>}

        {/* Confidence badge with color coding (#45) */}
        {activity.confidence !== null && (
          <span
            className={cn(
              'px-2 py-0.5 rounded text-xs font-bold',
              confidenceBgColor(activity.confidence),
              confidenceColor(activity.confidence),
            )}
            title={confidenceLabel(activity.confidence, t)}
          >
            {Math.round(activity.confidence * 100)}%
          </span>
        )}

        {/* Collapsed: inline last tool preview */}
        {!expanded && lastTool && (
          <span className="flex items-center gap-1.5 truncate">
            {lastTool.status === 'success' && <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />}
            {lastTool.status === 'error' && <XCircle size={12} className="text-red-400 shrink-0" />}
            {lastTool.status === 'running' && <Loader2 size={12} className="animate-spin text-amber-400 shrink-0" />}
            <span className={cn('font-bold', theme.accentText)}>{lastTool.name}</span>
            {lastTool.completedAt && (
              <span className={cn('text-xs', theme.textMuted)}>
                {((lastTool.completedAt - lastTool.startedAt) / 1000).toFixed(1)}s
              </span>
            )}
            {lastTool.summary && lastTool.status !== 'running' && (
              <span className={cn('truncate text-xs', theme.textMuted)}>
                {lastTool.summary.slice(0, 60)}
                {lastTool.summary.length > 60 ? '…' : ''}
              </span>
            )}
          </span>
        )}

        {/* Running tool count */}
        {runningTools.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-amber-400 font-bold">
            <Cog size={14} className="animate-spin" />
            {t('chat.toolsRunning', { count: runningTools.length })}
          </span>
        )}

        {/* Completed count */}
        {completedTools.length > 0 && (
          <span
            className={cn('flex items-center gap-1.5 text-xs', runningTools.length === 0 && 'ml-auto', theme.textMuted)}
          >
            <CheckCircle2 size={14} />
            {t('chat.toolsDone', { count: completedTools.length })}
          </span>
        )}

        {expanded ? (
          <ChevronUp size={14} className={theme.textMuted} />
        ) : (
          <ChevronDown size={14} className={theme.textMuted} />
        )}
      </button>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1.5">
              {/* Plan steps (memoized #5) */}
              {activity.planSteps.length > 0 && <div className="space-y-1">{planStepsList}</div>}

              {/* Tool calls (memoized #5) */}
              {activity.tools.length > 0 && <div className="space-y-1 pt-1">{toolRowsList}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

AgentActivityPanel.displayName = 'AgentActivityPanel';

// ============================================================================
// TOOL ROW
// ============================================================================

const ToolRow = memo<{ tool: ToolActivity; theme: ReturnType<typeof useViewTheme> }>(({ tool, theme }) => {
  const elapsed = tool.completedAt ? `${((tool.completedAt - tool.startedAt) / 1000).toFixed(1)}s` : null;

  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
      {tool.status === 'running' && <Loader2 size={14} className="animate-spin text-amber-400 shrink-0" />}
      {tool.status === 'success' && <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />}
      {tool.status === 'error' && <XCircle size={14} className="text-red-400 shrink-0" />}

      <Wrench size={14} className={cn(theme.textMuted, 'shrink-0')} />
      <span className={cn('font-bold', theme.accentText)}>{tool.name}</span>

      {elapsed && <span className={cn('text-xs', theme.textMuted)}>{elapsed}</span>}

      {tool.summary && tool.status !== 'running' && (
        <span className={cn('truncate max-w-[300px]', theme.textMuted)} title={tool.summary}>
          {tool.summary.slice(0, 80)}
          {tool.summary.length > 80 ? '…' : ''}
        </span>
      )}
    </motion.div>
  );
});

ToolRow.displayName = 'ToolRow';

export default AgentActivityPanel;
