import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  BrainCircuit,
  User,
  Share2,
  RefreshCw,
  Search,
  Trash2,
  ChevronDown,
  ChevronRight,
  Database,
  Loader2,
} from 'lucide-react';

interface MemoryEntry {
  id: string;
  timestamp: string;
  agent: string;
  type: 'fact' | 'error' | 'decision' | 'context';
  content: string;
  tags: string;
}

interface KnowledgeNode {
  id: string;
  type: string;
  label?: string;
}

interface KnowledgeEdge {
  source: string;
  target: string;
  label: string;
}

interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

// Wolf Swarm agents
const AGENTS = [
  { name: 'Geralt', role: 'Security Lead', color: 'text-gray-400' },
  { name: 'Yennefer', role: 'Architect', color: 'text-purple-400' },
  { name: 'Triss', role: 'QA Engineer', color: 'text-red-400' },
  { name: 'Jaskier', role: 'UX Writer', color: 'text-yellow-400' },
  { name: 'Vesemir', role: 'Code Reviewer', color: 'text-amber-400' },
  { name: 'Ciri', role: 'Performance', color: 'text-cyan-400' },
  { name: 'Eskel', role: 'DevOps', color: 'text-green-400' },
  { name: 'Lambert', role: 'Debugger', color: 'text-orange-400' },
  { name: 'Zoltan', role: 'Data Engineer', color: 'text-stone-400' },
  { name: 'Dijkstra', role: 'Strategist', color: 'text-blue-400' },
  { name: 'Philippa', role: 'API Specialist', color: 'text-pink-400' },
  { name: 'Regis', role: 'Researcher', color: 'text-indigo-400' },
  { name: 'Avallach', role: 'Knowledge Seeker', color: 'text-teal-400' },
  { name: 'Vilgefortz', role: 'Self-Learning', color: 'text-rose-400' },
  { name: 'Alzur', role: 'AI Trainer', color: 'text-amber-500' },
];

const TYPE_COLORS = {
  fact: 'bg-blue-500/20 text-blue-400',
  error: 'bg-red-500/20 text-red-400',
  decision: 'bg-green-500/20 text-green-400',
  context: 'bg-purple-500/20 text-purple-400',
};

// Knowledge Graph Visualizer (simple text-based)
function KnowledgeGraphView({ data }: { data: KnowledgeGraph | null }) {
  const [expanded, setExpanded] = useState(true);

  if (!data || !data.nodes || data.nodes.length === 0) {
    return (
      <div className="text-xs italic text-matrix-text-dim p-2">
        Knowledge graph is empty. Memories will build connections over time.
      </div>
    );
  }

  return (
    <div className="text-xs font-mono">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-matrix-accent hover:underline mb-2"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {data.nodes.length} nodes, {data.edges.length} edges
      </button>

      {expanded && (
        <div className="space-y-2 max-h-48 overflow-auto">
          {/* Nodes */}
          <div>
            <span className="text-matrix-text-dim">Nodes:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {data.nodes.slice(0, 20).map((node) => (
                <span
                  key={node.id}
                  className="px-1.5 py-0.5 bg-matrix-accent/20 text-matrix-accent rounded text-[10px]"
                  title={node.type}
                >
                  {node.label || node.id}
                </span>
              ))}
              {data.nodes.length > 20 && (
                <span className="text-matrix-text-dim">+{data.nodes.length - 20} more</span>
              )}
            </div>
          </div>

          {/* Edges */}
          <div>
            <span className="text-matrix-text-dim">Relations:</span>
            <ul className="mt-1 space-y-0.5">
              {data.edges.slice(0, 10).map((edge, i) => (
                <li key={i} className="text-[10px]">
                  {`${edge.source} --[${edge.label}]--> ${edge.target}`}
                </li>
              ))}
              {data.edges.length > 10 && (
                <li className="text-matrix-text-dim">+{data.edges.length - 10} more</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function MemoryPanel() {
  const [selectedAgent, setSelectedAgent] = useState<string>('Geralt');
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraph | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch agent memories
  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try to fetch from Tauri backend
      const result = await invoke<MemoryEntry[]>('get_agent_memories', {
        agent: selectedAgent,
        limit: 50,
      });
      setMemories(result);
    } catch (err) {
      // Fallback: generate mock data for demo
      setMemories([
        {
          id: '1',
          timestamp: new Date().toISOString(),
          agent: selectedAgent,
          type: 'fact',
          content: `${selectedAgent} initialized. Ready for tasks.`,
          tags: 'init,system',
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 60000).toISOString(),
          agent: selectedAgent,
          type: 'context',
          content: 'Working directory: C:\\Users\\BIURODOM\\Desktop\\ClaudeHydra',
          tags: 'context,path',
        },
      ]);
      // Don't show error for missing backend - this is expected during development
      console.log('Using mock memory data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedAgent]);

  // Fetch knowledge graph
  const fetchGraph = useCallback(async () => {
    try {
      const result = await invoke<KnowledgeGraph>('get_knowledge_graph');
      setKnowledgeGraph(result);
    } catch {
      // Mock data for demo
      setKnowledgeGraph({
        nodes: [
          { id: 'ClaudeHydra', type: 'project' },
          { id: 'React', type: 'framework' },
          { id: 'Tauri', type: 'framework' },
          { id: 'TypeScript', type: 'language' },
        ],
        edges: [
          { source: 'ClaudeHydra', target: 'React', label: 'uses' },
          { source: 'ClaudeHydra', target: 'Tauri', label: 'uses' },
          { source: 'ClaudeHydra', target: 'TypeScript', label: 'written_in' },
        ],
      });
    }
  }, []);

  // Clear agent memories
  const clearMemories = useCallback(async () => {
    if (!confirm(`Clear all memories for ${selectedAgent}?`)) return;
    setLoading(true);
    try {
      await invoke('clear_agent_memories', { agent: selectedAgent });
      setMemories([]);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedAgent]);

  // Initial fetch
  useEffect(() => {
    fetchMemories();
    fetchGraph();
  }, [fetchMemories, fetchGraph]);

  // Filter memories by search
  const filteredMemories = memories.filter(
    (m) =>
      m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.tags.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedAgentInfo = AGENTS.find((a) => a.name === selectedAgent);

  return (
    <div className="flex flex-col h-full bg-matrix-bg-secondary/50 rounded-lg border border-matrix-border">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-matrix-border">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-matrix-accent" />
          <span className="text-sm font-semibold text-matrix-text">Agent Memory</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchMemories();
              fetchGraph();
            }}
            className="p-1.5 rounded hover:bg-matrix-accent/20 text-matrix-text-dim hover:text-matrix-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={clearMemories}
            className="p-1.5 rounded hover:bg-red-500/20 text-matrix-text-dim hover:text-red-400 transition-colors"
            title="Clear memories"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Agent selector */}
      <div className="p-2 border-b border-matrix-border">
        <div className="flex items-center gap-2 mb-2">
          <User size={12} className="text-matrix-text-dim" />
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="flex-1 bg-matrix-bg-primary text-matrix-text text-xs px-2 py-1.5 rounded border border-matrix-border focus:border-matrix-accent outline-none"
          >
            {AGENTS.map((agent) => (
              <option key={agent.name} value={agent.name}>
                {agent.name} - {agent.role}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-matrix-text-dim" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories..."
            className="w-full bg-matrix-bg-primary text-matrix-text text-xs pl-7 pr-2 py-1.5 rounded border border-matrix-border focus:border-matrix-accent outline-none"
          />
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 text-xs text-red-400">{error}</div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-2 space-y-3">
        {/* Knowledge Graph Section */}
        <div className="p-2 bg-matrix-bg-primary/50 rounded border border-matrix-border">
          <div className="flex items-center gap-2 mb-2">
            <Share2 size={12} className="text-matrix-accent" />
            <span className="text-xs font-semibold text-matrix-text">Knowledge Graph</span>
          </div>
          <KnowledgeGraphView data={knowledgeGraph} />
        </div>

        {/* Memories Section */}
        <div className="p-2 bg-matrix-bg-primary/50 rounded border border-matrix-border">
          <div className="flex items-center gap-2 mb-2">
            <Database size={12} className={selectedAgentInfo?.color || 'text-matrix-accent'} />
            <span className="text-xs font-semibold text-matrix-text">
              {selectedAgent}'s Memories ({filteredMemories.length})
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={16} className="animate-spin text-matrix-accent" />
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="text-xs text-matrix-text-dim italic py-2">
              No memories found. {selectedAgent} will learn as you work.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {filteredMemories.map((memory) => (
                <div
                  key={memory.id}
                  className="p-2 bg-black/20 rounded border border-matrix-border/50 text-xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${TYPE_COLORS[memory.type]}`}>
                      {memory.type}
                    </span>
                    <span className="text-[10px] text-matrix-text-dim">
                      {new Date(memory.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-matrix-text font-mono">{memory.content}</p>
                  {memory.tags && (
                    <div className="flex gap-1 mt-1">
                      {memory.tags.split(',').map((tag, i) => (
                        <span
                          key={i}
                          className="px-1 py-0.5 bg-matrix-accent/10 text-matrix-accent rounded text-[9px]"
                        >
                          #{tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-matrix-border text-[10px] text-matrix-text-dim">
        <span className={selectedAgentInfo?.color}>●</span> {selectedAgentInfo?.name}:{' '}
        {selectedAgentInfo?.role}
      </div>
    </div>
  );
}
