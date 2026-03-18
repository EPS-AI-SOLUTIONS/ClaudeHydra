/**
 * SwarmView — Cross-Agent Communication Visualization
 *
 * Uses @xyflow/react to render an interactive agent network graph showing
 * peer Hydra instances, their status, and delegation flows between them.
 */

import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  Panel,
  Position,
  ReactFlow,
} from '@xyflow/react';
import { useCallback, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import {
  Activity,
  Brain,
  CheckCircle2,
  Globe,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Network,
  Paperclip,
  Play,
  RefreshCw,
  Send,
  Shield,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { type OrchestrationPattern, type SwarmPeer, type SwarmTaskSummary, useSwarm } from '../hooks/useSwarm';
import { MemoryPruningPanel } from './MemoryPruningPanel';
import { SandboxPanel } from './SandboxPanel';
import { SwarmBuilder } from './SwarmBuilder';

// ── Provider colors ──────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  anthropic: { bg: '#1a1a2e', border: '#d97706', text: '#fbbf24' },
  google: { bg: '#1a2e1a', border: '#22c55e', text: '#4ade80' },
  xai: { bg: '#2e1a1a', border: '#ef4444', text: '#f87171' },
  openai: { bg: '#1a2e2e', border: '#06b6d4', text: '#22d3ee' },
  deepseek: { bg: '#2e1a2e', border: '#a855f7', text: '#c084fc' },
  multi: { bg: '#2e2e1a', border: '#eab308', text: '#facc15' },
};

const STATUS_COLORS: Record<string, string> = {
  online: '#22c55e',
  offline: '#6b7280',
  degraded: '#f59e0b',
  unknown: '#6b7280',
};

// ── Peer Node Component ──────────────────────────────────────────────────────

const DEFAULT_COLORS = { bg: '#2e2e1a', border: '#eab308', text: '#facc15' };

function PeerNode({ data }: { data: { peer: SwarmPeer; isSelf: boolean } }) {
  const { peer, isSelf } = data;
  const colors = PROVIDER_COLORS[peer.provider] ?? DEFAULT_COLORS;

  return (
    <div
      style={{
        background: colors.bg,
        border: `2px solid ${isSelf ? '#ffffff' : colors.border}`,
        borderRadius: '12px',
        padding: '16px 20px',
        minWidth: '160px',
        boxShadow: isSelf ? '0 0 20px rgba(255,255,255,0.15)' : `0 0 12px ${colors.border}33`,
        position: 'relative',
      }}
    >
      {/* Status dot */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: STATUS_COLORS[peer.status] || '#6b7280',
          boxShadow: peer.status === 'online' ? `0 0 8px ${STATUS_COLORS['online']}` : 'none',
        }}
      />

      <div style={{ fontSize: '14px', fontWeight: 700, color: colors.text }}>{peer.name}</div>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
        {peer.provider.toUpperCase()} · :{peer.port}
      </div>
      {peer.version && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>v{peer.version}</div>}
      {isSelf && (
        <div
          style={{
            fontSize: '9px',
            color: '#fbbf24',
            marginTop: '4px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}
        >
          {/* i18n: translated at SwarmView level via prop */}
          This Instance
        </div>
      )}
    </div>
  );
}

const nodeTypes = { peer: PeerNode };

// ── Main Component ───────────────────────────────────────────────────────────

export function SwarmView() {
  const { t } = useTranslation();
  const { peers, tasks, events, stats, isDiscovering, isDelegating, discover, delegate, loadTask, selectedTask } =
    useSwarm();

  const [showDelegatePanel, setShowDelegatePanel] = useState(false);
  const [delegatePrompt, setDelegatePrompt] = useState('');
  const [delegatePattern, setDelegatePattern] = useState<OrchestrationPattern>('parallel');
  const [delegateTargets, setDelegateTargets] = useState<string[]>([]);
  const [delegateAttachments, setDelegateAttachments] = useState<{ contentType: string; url: string; name?: string }[]>(
    [],
  );
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'monitoring' | 'builder' | 'sandbox' | 'pruning'>('monitoring');

  // ── Build flow graph ───────────────────────────────────────────────────

  const { nodes, edges } = useMemo(() => {
    const centerX = 400;
    const centerY = 300;
    const radius = 220;

    const flowNodes: Node[] = peers.map((peer, i) => {
      const angle = (2 * Math.PI * i) / peers.length - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle) - 80;
      const y = centerY + radius * Math.sin(angle) - 40;

      return {
        id: peer.id,
        type: 'peer',
        position: { x, y },
        data: { peer, isSelf: peer.id === 'claudehydra' },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });

    // Create edges for recent delegations
    const flowEdges: Edge[] = [];
    const recentTasks = tasks.slice(0, 10);

    for (const task of recentTasks) {
      for (const target of task.target_peers) {
        const isSuccess = task.status === 'completed';
        const isRunning = task.status === 'running';

        flowEdges.push({
          id: `${task.id}-${target}`,
          source: task.source_peer,
          target,
          animated: isRunning,
          style: {
            stroke: isSuccess ? '#22c55e' : isRunning ? '#3b82f6' : '#ef4444',
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isSuccess ? '#22c55e' : isRunning ? '#3b82f6' : '#ef4444',
          },
          label: isRunning ? 'working...' : task.pattern,
          labelStyle: { fontSize: 10, fill: '#94a3b8' },
        });
      }
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [peers, tasks]);

  // ── Delegate handler ───────────────────────────────────────────────────

  const handleDelegate = useCallback(async () => {
    if (!delegatePrompt.trim()) return;
    await delegate(delegatePrompt, delegatePattern, delegateTargets, 120, delegateAttachments);
    setDelegatePrompt('');
    setDelegateAttachments([]);
    setAttachmentUrl('');
    setShowDelegatePanel(false);
  }, [delegate, delegatePrompt, delegatePattern, delegateTargets, delegateAttachments]);

  const addAttachment = useCallback(() => {
    if (!attachmentUrl.trim()) return;
    const url = attachmentUrl.trim();
    // Infer content type from URL
    let contentType = 'application/octet-stream';
    const ext = url.split('.').pop()?.toLowerCase() ?? '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
      contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    else if (ext === 'pdf') contentType = 'application/pdf';
    else if (['txt', 'md', 'log'].includes(ext)) contentType = 'text/plain';
    else if (['json'].includes(ext)) contentType = 'application/json';

    const name = url.split('/').pop() || 'attachment';
    setDelegateAttachments((prev) => [...prev, { contentType, url, name }]);
    setAttachmentUrl('');
  }, [attachmentUrl]);

  const removeAttachment = useCallback((index: number) => {
    setDelegateAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Toggle target selection ────────────────────────────────────────────

  const toggleTarget = useCallback((peerId: string) => {
    setDelegateTargets((prev) => (prev.includes(peerId) ? prev.filter((id) => id !== peerId) : [...prev, peerId]));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0a0f' }}>
      {/* ── Tab Switcher ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', padding: '12px', borderBottom: '1px solid #1e293b' }}>
        <button
          type="button"
          onClick={() => setActiveTab('monitoring')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            background: activeTab === 'monitoring' ? '#1e293b' : 'transparent',
            color: activeTab === 'monitoring' ? '#e2e8f0' : '#94a3b8',
            border: activeTab === 'monitoring' ? '1px solid #334155' : '1px solid transparent',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          <Activity size={16} /> {t('swarm.tabs.monitoring')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('builder')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            background: activeTab === 'builder' ? '#1e293b' : 'transparent',
            color: activeTab === 'builder' ? '#e2e8f0' : '#94a3b8',
            border: activeTab === 'builder' ? '1px solid #334155' : '1px solid transparent',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          <LayoutTemplate size={16} /> {t('swarm.tabs.builder')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sandbox')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            background: activeTab === 'sandbox' ? '#1e293b' : 'transparent',
            color: activeTab === 'sandbox' ? '#10b981' : '#94a3b8',
            border: activeTab === 'sandbox' ? '1px solid #10b981' : '1px solid transparent',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          <Shield size={16} /> {t('swarm.tabs.sandbox')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pruning')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            background: activeTab === 'pruning' ? '#1e293b' : 'transparent',
            color: activeTab === 'pruning' ? '#c084fc' : '#94a3b8',
            border: activeTab === 'pruning' ? '1px solid #a855f7' : '1px solid transparent',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          <Brain size={16} /> {t('swarm.tabs.pruning')}
        </button>
      </div>

      {activeTab === 'pruning' ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <MemoryPruningPanel />
        </div>
      ) : activeTab === 'sandbox' ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <SandboxPanel />
        </div>
      ) : activeTab === 'builder' ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <SwarmBuilder events={events} />
        </div>
      ) : (
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* ── Graph area ────────────────────────────────────────────────── */}
          <div style={{ flex: 1, position: 'relative' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
              style={{ background: '#0a0a0f' }}
            >
              <Background color="#1e293b" gap={24} />
              <Controls style={{ background: '#1e293b', borderColor: '#334155' }} />
              <MiniMap
                nodeColor={(node) => {
                  const peer = node.data?.['peer'] as SwarmPeer | undefined;
                  if (!peer) return '#6b7280';
                  return STATUS_COLORS[peer.status] || '#6b7280';
                }}
                style={{ background: '#0f172a', borderColor: '#334155' }}
              />

              {/* Top panel — stats & actions */}
              <Panel position="top-left">
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: '#0f172a',
                    borderRadius: '8px',
                    border: '1px solid #1e293b',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Network size={16} color="#3b82f6" />
                    <span style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>{t('swarm.title')}</span>
                  </div>
                  <div style={{ width: '1px', height: '20px', background: '#334155' }} />

                  <Stat
                    icon={<Globe size={14} />}
                    label={t('swarm.stats.online')}
                    value={`${stats.onlinePeers}/${stats.totalPeers}`}
                    color="#22c55e"
                  />
                  <Stat
                    icon={<Activity size={14} />}
                    label={t('swarm.stats.running')}
                    value={stats.runningTasks}
                    color="#3b82f6"
                  />
                  <Stat
                    icon={<CheckCircle2 size={14} />}
                    label={t('swarm.stats.done')}
                    value={stats.completedTasks}
                    color="#22c55e"
                  />
                  <Stat
                    icon={<XCircle size={14} />}
                    label={t('swarm.stats.failed')}
                    value={stats.failedTasks}
                    color="#ef4444"
                  />

                  <div style={{ width: '1px', height: '20px', background: '#334155' }} />

                  <button
                    type="button"
                    onClick={discover}
                    disabled={isDiscovering}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#e2e8f0',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {isDiscovering ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {t('swarm.discover')}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDelegatePanel(!showDelegatePanel)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      background: '#3b82f6',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <Send size={14} />
                    {t('swarm.delegate')}
                  </button>
                </div>
              </Panel>
            </ReactFlow>

            {/* ── Delegate panel (overlay) ───────────────────────────────── */}
            <AnimatePresence>
              {showDelegatePanel && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  style={{
                    position: 'absolute',
                    top: '60px',
                    left: '12px',
                    width: '400px',
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    padding: '16px',
                    zIndex: 10,
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', marginBottom: '12px' }}>
                    <Zap size={16} style={{ display: 'inline', marginRight: '6px' }} />
                    {t('swarm.delegateTitle')}
                  </div>

                  <textarea
                    value={delegatePrompt}
                    onChange={(e) => setDelegatePrompt(e.target.value)}
                    placeholder={t('swarm.delegatePrompt')}
                    rows={3}
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#e2e8f0',
                      padding: '8px 12px',
                      fontSize: '13px',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                  />

                  {/* Pattern selector */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                    {(['parallel', 'sequential', 'review', 'fan_out'] as OrchestrationPattern[]).map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setDelegatePattern(p)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          border: delegatePattern === p ? '1px solid #3b82f6' : '1px solid #334155',
                          background: delegatePattern === p ? '#1e3a5f' : '#1e293b',
                          color: delegatePattern === p ? '#60a5fa' : '#94a3b8',
                          cursor: 'pointer',
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  {/* Target selection */}
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
                      {t('swarm.delegateTargets')}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {peers
                        .filter((p) => p.id !== 'claudehydra' && p.status === 'online')
                        .map((peer) => {
                          const selected = delegateTargets.includes(peer.id);
                          const colors = PROVIDER_COLORS[peer.provider] ?? DEFAULT_COLORS;
                          return (
                            <button
                              type="button"
                              key={peer.id}
                              onClick={() => toggleTarget(peer.id)}
                              style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                border: `1px solid ${selected ? colors.border : '#334155'}`,
                                background: selected ? `${colors.bg}` : '#1e293b',
                                color: selected ? colors.text : '#94a3b8',
                                cursor: 'pointer',
                              }}
                            >
                              {peer.name}
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* Attachments section */}
                  <div style={{ marginTop: '10px' }}>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#94a3b8',
                        marginBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Paperclip size={12} />
                      {t('swarm.delegateAttachments')}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        value={attachmentUrl}
                        onChange={(e) => setAttachmentUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addAttachment()}
                        placeholder="https://... or file:///..."
                        style={{
                          flex: 1,
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#e2e8f0',
                          padding: '4px 8px',
                          fontSize: '11px',
                        }}
                      />
                      <button
                        type="button"
                        onClick={addAttachment}
                        disabled={!attachmentUrl.trim()}
                        style={{
                          padding: '4px 8px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#e2e8f0',
                          fontSize: '11px',
                          cursor: attachmentUrl.trim() ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {t('swarm.addAttachment')}
                      </button>
                    </div>
                    {delegateAttachments.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {delegateAttachments.map((att, attIdx) => (
                          <div
                            key={att.url}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              background: '#1e293b',
                              border: '1px solid #334155',
                              borderRadius: '6px',
                              fontSize: '10px',
                              color: '#94a3b8',
                            }}
                          >
                            {att.contentType.startsWith('image/') ? (
                              <ImageIcon size={10} color="#3b82f6" />
                            ) : (
                              <Paperclip size={10} color="#94a3b8" />
                            )}
                            <span
                              style={{
                                maxWidth: '120px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {att.name || 'attachment'}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeAttachment(attIdx)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '0',
                                display: 'flex',
                              }}
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Execute button */}
                  <button
                    type="button"
                    onClick={handleDelegate}
                    disabled={isDelegating || !delegatePrompt.trim()}
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      padding: '8px',
                      background: isDelegating ? '#1e293b' : '#3b82f6',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: isDelegating ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    {isDelegating ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        {t('swarm.delegating')}
                      </>
                    ) : (
                      <>
                        <Play size={14} />
                        {t('swarm.executing')}
                      </>
                    )}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Right sidebar — events & tasks ────────────────────────────── */}
          <div
            style={{
              width: '320px',
              borderLeft: '1px solid #1e293b',
              background: '#0f172a',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Tasks section */}
            <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
                {t('swarm.recentTasks')}
              </div>
              {tasks.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#64748b', padding: '20px 0', textAlign: 'center' }}>
                  {t('swarm.noTasks')}
                </div>
              ) : (
                tasks
                  .slice(0, 20)
                  .map((task) => <TaskRow key={task.id} task={task} onClick={() => loadTask(task.id)} />)
              )}
            </div>

            {/* Events log */}
            <div
              style={{
                height: '200px',
                borderTop: '1px solid #1e293b',
                overflow: 'auto',
                padding: '12px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
                {t('swarm.liveEvents')}
              </div>
              {events.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '12px' }}>
                  {t('swarm.waitingEvents')}
                </div>
              ) : (
                events.slice(0, 30).map((event) => (
                  <div
                    key={`${event.taskId}-${event.timestamp}-${event.eventType}-${event.peerId ?? ''}`}
                    style={{
                      fontSize: '11px',
                      color: '#94a3b8',
                      padding: '3px 0',
                      borderBottom: '1px solid #1e293b22',
                    }}
                  >
                    <span style={{ color: eventColor(event.eventType) }}>{event.eventType}</span>
                    {event.peerId && <span style={{ color: '#64748b' }}> [{event.peerId}]</span>}
                    <span> — {event.message}</span>
                  </div>
                ))
              )}
            </div>

            {/* Task details panel */}
            <AnimatePresence>
              {selectedTask && (
                <motion.div
                  initial={{ x: 320 }}
                  animate={{ x: 0 }}
                  exit={{ x: 320 }}
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '400px',
                    background: '#0f172a',
                    borderLeft: '1px solid #1e293b',
                    zIndex: 20,
                    overflow: 'auto',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>{t('swarm.taskDetails')}</div>
                    <button
                      type="button"
                      onClick={() => loadTask('')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '16px',
                      }}
                    >
                      &times;
                    </button>
                  </div>

                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    <div>
                      Pattern: <span style={{ color: '#e2e8f0' }}>{selectedTask.pattern}</span>
                    </div>
                    <div>
                      Status: <span style={{ color: statusColor(selectedTask.status) }}>{selectedTask.status}</span>
                    </div>
                    {selectedTask.duration_ms && (
                      <div>
                        Duration: <span style={{ color: '#e2e8f0' }}>{selectedTask.duration_ms}ms</span>
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px' }}>
                    <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>Prompt:</div>
                    <div style={{ background: '#1e293b', padding: '8px', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                      {selectedTask.prompt}
                    </div>
                    {selectedTask.attachments && selectedTask.attachments.length > 0 && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                        {selectedTask.attachments.map((att) => (
                          <div
                            key={att.url}
                            style={{
                              position: 'relative',
                              width: '60px',
                              height: '60px',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              border: '1px solid #334155',
                            }}
                          >
                            {att.contentType.startsWith('image/') ? (
                              <img
                                src={att.url}
                                alt={att.name || 'attachment'}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: '#0f172a',
                                  fontSize: '10px',
                                }}
                              >
                                DOC
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedTask.results.map((result) => (
                    <div
                      key={result.peer_id}
                      style={{
                        marginTop: '12px',
                        padding: '10px',
                        background: '#1e293b',
                        borderRadius: '8px',
                        borderLeft: `3px solid ${result.status === 'success' ? '#22c55e' : '#ef4444'}`,
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>
                        {result.peer_name}
                        {result.model_used && (
                          <span style={{ fontWeight: 400, color: '#64748b' }}> · {result.model_used}</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        {result.duration_ms}ms
                        {result.tokens_used && ` · ${result.tokens_used} tokens`}
                      </div>
                      {result.content && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#cbd5e1',
                            marginTop: '6px',
                            maxHeight: '200px',
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {result.content}
                        </div>
                      )}
                      {result.attachments && result.attachments.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                          {result.attachments.map((att) => (
                            <div
                              key={att.url}
                              style={{
                                position: 'relative',
                                width: '60px',
                                height: '60px',
                                borderRadius: '4px',
                                overflow: 'hidden',
                                border: '1px solid #3b82f6',
                              }}
                            >
                              {att.contentType.startsWith('image/') ? (
                                <img
                                  src={att.url}
                                  alt={att.name || 'result attachment'}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: '#0a0a0f',
                                    fontSize: '10px',
                                  }}
                                >
                                  DOC
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {result.error && (
                        <div style={{ fontSize: '11px', color: '#f87171', marginTop: '4px' }}>{result.error}</div>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────────────────────

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ fontSize: '11px', color: '#64748b' }}>{label}:</span>
      <span style={{ fontSize: '12px', color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function TaskRow({ task, onClick }: { task: SwarmTaskSummary; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '8px',
        padding: '8px 10px',
        marginBottom: '6px',
        cursor: 'pointer',
        color: '#e2e8f0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 600 }}>{task.pattern}</span>
        <span
          style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '4px',
            background: statusBg(task.status),
            color: statusColor(task.status),
          }}
        >
          {task.status}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
        {task.prompt_preview.slice(0, 80)}
        {task.prompt_preview.length > 80 && '...'}
      </div>
      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
        {task.success_count}/{task.results_count} peers
        {task.duration_ms && ` · ${task.duration_ms}ms`}
      </div>
    </button>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return '#22c55e';
    case 'running':
      return '#3b82f6';
    case 'failed':
      return '#ef4444';
    case 'partial_success':
      return '#f59e0b';
    default:
      return '#94a3b8';
  }
}

function statusBg(status: string): string {
  switch (status) {
    case 'completed':
      return '#052e16';
    case 'running':
      return '#172554';
    case 'failed':
      return '#450a0a';
    case 'partial_success':
      return '#451a03';
    default:
      return '#1e293b';
  }
}

function eventColor(eventType: string): string {
  if (eventType.includes('completed') || eventType.includes('discovered')) return '#22c55e';
  if (eventType.includes('error') || eventType.includes('failed') || eventType.includes('lost')) return '#ef4444';
  if (eventType.includes('sent') || eventType.includes('working')) return '#3b82f6';
  if (eventType.includes('timeout')) return '#f59e0b';
  if (eventType.includes('attachment') || eventType.includes('media')) return '#a855f7';
  return '#94a3b8';
}
