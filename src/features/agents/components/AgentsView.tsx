/**
 * AgentsView — 12 Claude AI Agent Grid
 * ======================================
 * Displays all 12 Claude AI model agents in a responsive grid layout.
 * Each card shows: name, role, tier, status, description.
 * Filter by tier (Commander / Coordinator / Executor).
 *
 * Commander tier = Claude Opus 4.6 (strategic, deep reasoning)
 * Coordinator tier = Claude Sonnet 4.5 (balanced, versatile)
 * Executor tier = Claude Haiku 4.5 (fast, efficient)
 */

import { cn, EmptyState, ErrorBoundary } from '@jaskier/ui';
import {
  Bot,
  Brain,
  Crown,
  Filter,
  GitBranch,
  Shield,
  Swords,
  Terminal as TerminalIcon,
  Users,
  Wand2,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card } from '@/components/atoms';
import { StatusIndicator, type StatusState } from '@/components/molecules/StatusIndicator';
import { type BackendLogEntry, useBackendLogs } from '@/features/logs/hooks/useLogs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return (
      d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  } catch {
    return ts;
  }
}

function levelBadgeClasses(level: string): string {
  const l = level.toUpperCase();
  if (l === 'ERROR') return 'text-red-400';
  if (l === 'WARN') return 'text-amber-400';
  if (l === 'INFO') return 'text-blue-400';
  return 'text-gray-400';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentTier = 'Commander' | 'Coordinator' | 'Executor';

interface ClaudeAgent {
  id: string;
  name: string;
  model: string;
  role: string;
  tier: AgentTier;
  status: StatusState;
  description: string;
  icon: typeof Shield;
  color: string;
}

type TierFilter = AgentTier | 'All';

// ---------------------------------------------------------------------------
// Agent Data
// ---------------------------------------------------------------------------

const CLAUDE_AGENTS: readonly ClaudeAgent[] = [
  {
    id: 'opus-sentinel',
    name: 'Opus Sentinel',
    model: 'claude-opus-4-6',
    role: 'Security & Protection',
    tier: 'Commander',
    status: 'online',
    description: 'Deep reasoning for security audits, threat modeling, vulnerability analysis, and code safety.',
    icon: Shield,
    color: 'text-amber-400',
  },
  {
    id: 'opus-architect',
    name: 'Opus Architect',
    model: 'claude-opus-4-6',
    role: 'Architecture & Design',
    tier: 'Commander',
    status: 'online',
    description: 'System architecture, design patterns, complex refactoring, and structural integrity analysis.',
    icon: Wand2,
    color: 'text-purple-400',
  },
  {
    id: 'opus-mentor',
    name: 'Opus Mentor',
    model: 'claude-opus-4-6',
    role: 'Code Review & Mentoring',
    tier: 'Commander',
    status: 'online',
    description: 'In-depth code review, best practices enforcement, mentoring, and quality gates.',
    icon: Brain,
    color: 'text-blue-400',
  },
  {
    id: 'sonnet-frontend',
    name: 'Sonnet Frontend',
    model: 'claude-sonnet-4-6',
    role: 'Frontend & UX',
    tier: 'Coordinator',
    status: 'online',
    description: 'UI components, accessibility, responsive design, and user experience optimization.',
    icon: Zap,
    color: 'text-pink-400',
  },
  {
    id: 'sonnet-docs',
    name: 'Sonnet Docs',
    model: 'claude-sonnet-4-6',
    role: 'Documentation & Comms',
    tier: 'Coordinator',
    status: 'online',
    description: 'Documentation, README, changelog, technical writing, and knowledge base maintenance.',
    icon: Bot,
    color: 'text-yellow-400',
  },
  {
    id: 'sonnet-research',
    name: 'Sonnet Research',
    model: 'claude-sonnet-4-6',
    role: 'Intelligence & Research',
    tier: 'Coordinator',
    status: 'online',
    description: 'Data analysis, competitive research, trend analysis, and technological intelligence.',
    icon: Bot,
    color: 'text-indigo-400',
  },
  {
    id: 'sonnet-innovator',
    name: 'Sonnet Innovator',
    model: 'claude-sonnet-4-6',
    role: 'Innovation & Experiments',
    tier: 'Coordinator',
    status: 'online',
    description: 'Emerging technologies, rapid prototyping, PoC development, and experimental features.',
    icon: Wand2,
    color: 'text-emerald-400',
  },
  {
    id: 'sonnet-strategist',
    name: 'Sonnet Strategist',
    model: 'claude-sonnet-4-6',
    role: 'Analysis & Strategy',
    tier: 'Coordinator',
    status: 'online',
    description: 'Deep analysis, strategic planning, risk assessment, and long-term decision support.',
    icon: Brain,
    color: 'text-cyan-400',
  },
  {
    id: 'haiku-tester',
    name: 'Haiku Tester',
    model: 'claude-haiku-4-5',
    role: 'Testing & QA',
    tier: 'Executor',
    status: 'online',
    description: 'Fast unit tests, integration tests, E2E testing, and automated quality assurance.',
    icon: Swords,
    color: 'text-red-400',
  },
  {
    id: 'haiku-devops',
    name: 'Haiku DevOps',
    model: 'claude-haiku-4-5',
    role: 'DevOps & Infrastructure',
    tier: 'Executor',
    status: 'online',
    description: 'CI/CD pipelines, Docker orchestration, deployment automation, and health monitoring.',
    icon: GitBranch,
    color: 'text-green-400',
  },
  {
    id: 'haiku-optimizer',
    name: 'Haiku Optimizer',
    model: 'claude-haiku-4-5',
    role: 'Performance & Optimization',
    tier: 'Executor',
    status: 'online',
    description: 'Bundle profiling, caching strategies, lazy loading, and runtime performance tuning.',
    icon: Swords,
    color: 'text-orange-400',
  },
  {
    id: 'haiku-integrator',
    name: 'Haiku Integrator',
    model: 'claude-haiku-4-5',
    role: 'API & Integration',
    tier: 'Executor',
    status: 'online',
    description: 'API design, protocol handling, middleware pipelines, and third-party integrations.',
    icon: Zap,
    color: 'text-violet-400',
  },
] as const;

// ---------------------------------------------------------------------------
// Tier Metadata
// ---------------------------------------------------------------------------

const TIER_FILTERS: readonly TierFilter[] = ['All', 'Commander', 'Coordinator', 'Executor'] as const;

const tierBadgeVariant: Record<AgentTier, 'accent' | 'warning' | 'default'> = {
  Commander: 'accent',
  Coordinator: 'warning',
  Executor: 'default',
};

const tierIcon: Record<AgentTier, typeof Crown> = {
  Commander: Crown,
  Coordinator: Users,
  Executor: Swords,
};

// ---------------------------------------------------------------------------
// Animation Variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 25 },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};

// ---------------------------------------------------------------------------
// AgentCard Sub-component
// ---------------------------------------------------------------------------

interface AgentCardProps {
  agent: ClaudeAgent;
}

function AgentCard({ agent }: AgentCardProps) {
  const Icon = agent.icon;
  const TierIcon = tierIcon[agent.tier];

  return (
    <motion.div data-testid={`agent-card-${agent.id}`} variants={cardVariants} layout layoutId={agent.id}>
      <Card variant="hover" padding="none" interactive className="h-full">
        <div className="p-4 space-y-3">
          {/* Header: Icon + Name + Status */}
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                'bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-border)]',
                agent.color,
              )}
            >
              <Icon size={20} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--matrix-text-primary)] truncate">{agent.name}</h3>
                <StatusIndicator status={agent.status} size="sm" />
              </div>
              <p className="text-[11px] text-[var(--matrix-text-secondary)] truncate">{agent.role}</p>
              <p className="text-[10px] text-[var(--matrix-accent)]/60 font-mono truncate">{agent.model}</p>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs text-[var(--matrix-text-secondary)] leading-relaxed line-clamp-2">
            {agent.description}
          </p>

          {/* Footer: Tier Badge + Status Label */}
          <div className="flex items-center justify-between pt-1">
            <Badge variant={tierBadgeVariant[agent.tier]} size="sm" icon={<TierIcon size={10} />}>
              {agent.tier}
            </Badge>

            <StatusIndicator status={agent.status} size="sm" label={agent.status} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AgentsView Component
// ---------------------------------------------------------------------------

export function AgentsView() {
  const { t } = useTranslation();
  const [activeTier, setActiveTier] = useState<TierFilter>('All');

  // Real-time terminal logs state
  const { data, isLoading } = useBackendLogs({ limit: 50 }, true);
  const logs = data?.logs ?? [];

  const filteredAgents = useMemo(() => {
    if (activeTier === 'All') return CLAUDE_AGENTS;
    return CLAUDE_AGENTS.filter((a) => a.tier === activeTier);
  }, [activeTier]);

  const tierCounts = useMemo(() => {
    const counts: Record<TierFilter, number> = {
      All: CLAUDE_AGENTS.length,
      Commander: 0,
      Coordinator: 0,
      Executor: 0,
    };
    for (const agent of CLAUDE_AGENTS) {
      counts[agent.tier]++;
    }
    return counts;
  }, []);

  const onlineCount = useMemo(() => CLAUDE_AGENTS.filter((a) => a.status === 'online').length, []);

  return (
    <ErrorBoundary>
      <div data-testid="agents-view" className="h-full flex flex-col xl:flex-row gap-4 overflow-hidden p-4 sm:p-6">
        {/* Main Agents Area */}
        <div className="flex-1 flex flex-col overflow-auto pr-2">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-6 flex-shrink-0"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-[var(--matrix-accent)]/10 border border-[var(--matrix-accent)]/20 flex items-center justify-center">
                <Users size={20} className="text-[var(--matrix-accent)]" />
              </div>
              <div>
                <h2
                  data-testid="agents-header"
                  className="text-lg font-semibold text-[var(--matrix-accent)] text-glow-subtle"
                >
                  Claude AI Agent Swarm
                </h2>
                <p data-testid="agents-online-count" className="text-xs text-[var(--matrix-text-secondary)]">
                  {onlineCount} of {CLAUDE_AGENTS.length} agents online
                </p>
              </div>
            </div>

            <p className="text-sm text-[var(--matrix-text-secondary)] mb-4">
              12 specialized Claude AI agents — Opus, Sonnet & Haiku — organized in a hierarchical swarm structure.
            </p>

            {/* Tier Filter Buttons */}
            <div data-testid="agents-filter-bar" className="flex items-center gap-2 flex-wrap">
              <Filter size={14} className="text-[var(--matrix-text-secondary)]" />
              {TIER_FILTERS.map((tier) => (
                <Button
                  key={tier}
                  data-testid={`agents-filter-${tier.toLowerCase()}`}
                  variant={activeTier === tier ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setActiveTier(tier)}
                >
                  {tier}
                  <span className="ml-1 opacity-70">({tierCounts[tier]})</span>
                </Button>
              ))}
            </div>
          </motion.div>

          {/* Agent Grid */}
          <div className="flex-1 overflow-auto">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={activeTier}
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                data-testid="agents-grid"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4"
              >
                {filteredAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </motion.div>
            </AnimatePresence>

            {/* Empty State */}
            {filteredAgents.length === 0 && (
              <EmptyState
                icon={<Users />}
                title={t('agents.noMatch', 'No agents match the selected filter')}
                description={t('agents.noMatchDesc', 'Try selecting a different tier filter to see agents.')}
                className="flex-1"
              />
            )}
          </div>
        </div>

        {/* Terminal Logs Sidebar */}
        <div className="w-full xl:w-96 h-64 xl:h-full flex-shrink-0 flex flex-col border border-[var(--matrix-border)] rounded-xl bg-[var(--matrix-bg-secondary)] overflow-hidden shadow-lg">
          <div className="flex items-center gap-2 p-3 border-b border-[var(--matrix-border)] bg-black/20">
            <TerminalIcon size={16} className="text-[var(--matrix-accent)]" />
            <h3 className="text-sm font-mono font-semibold text-[var(--matrix-text-primary)]">Agents Terminal</h3>
            {isLoading && (
              <span className="ml-auto text-xs text-[var(--matrix-text-secondary)] animate-pulse">Loading...</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-[10px] sm:text-xs bg-black/40">
            {logs.length === 0 && !isLoading && (
              <div className="text-[var(--matrix-text-secondary)] italic">Awaiting logs...</div>
            )}
            {logs.map((entry: BackendLogEntry, i: number) => (
              <div key={`${entry.timestamp}-${i}`} className="flex items-start gap-2 break-all">
                <span className="text-[var(--matrix-text-secondary)] opacity-50 shrink-0">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span className={cn('shrink-0 font-semibold', levelBadgeClasses(entry.level))}>[{entry.level}]</span>
                <span className="text-[var(--matrix-text-primary)]">
                  <span className="text-[var(--matrix-accent)] opacity-70 mr-1">{entry.target}:</span>
                  {entry.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default AgentsView;
