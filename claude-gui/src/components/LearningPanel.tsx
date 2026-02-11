import { invoke } from '@tauri-apps/api/core';
import {
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  Download,
  FileJson,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

interface LearningStats {
  rag_documents: number;
  rag_memory_mb: number;
  embedding_model_available: boolean;
  instruction_examples: number;
  conversation_examples: number;
  preference_examples: number;
}

interface UserPreferences {
  language: string;
  code_language: string;
  frameworks: string[];
  coding_style: string;
  persona: string;
}

interface RagDocument {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

interface TrainingExample {
  instruction: string;
  input: string;
  output: string;
  collected_at: string;
}

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="glass-card p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={color} />
        <span className="text-xs text-matrix-text-dim">{label}</span>
      </div>
      <div className="text-lg font-bold text-matrix-text">{value}</div>
    </div>
  );
}

function SectionHeader({
  title,
  icon: Icon,
  expanded,
  onToggle,
  actions,
}: {
  title: string;
  icon: React.ElementType;
  expanded: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-2 bg-matrix-bg-primary/50 rounded-t border-b border-matrix-border">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 hover:text-matrix-accent transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={14} className="text-matrix-accent" />
        <span className="text-sm font-semibold">{title}</span>
      </button>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function LearningPanel() {
  // State
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [ragResults, setRagResults] = useState<RagDocument[]>([]);
  const [trainingExamples, setTrainingExamples] = useState<TrainingExample[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Section toggles
  const [showStats, setShowStats] = useState(true);
  const [showRag, setShowRag] = useState(true);
  const [showTraining, setShowTraining] = useState(true);
  const [showPreferences, setShowPreferences] = useState(false);

  // Editing state
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [editedPrefs, setEditedPrefs] = useState<UserPreferences | null>(null);

  // Add document state
  const [addDocContent, setAddDocContent] = useState('');
  const [addingDoc, setAddingDoc] = useState(false);

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchStats = useCallback(async () => {
    try {
      const result = await invoke<LearningStats>('learning_get_stats');
      setStats(result);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      // Mock data for development
      setStats({
        rag_documents: 0,
        rag_memory_mb: 0,
        embedding_model_available: false,
        instruction_examples: 0,
        conversation_examples: 0,
        preference_examples: 0,
      });
    }
  }, []);

  const fetchPreferences = useCallback(async () => {
    try {
      const result = await invoke<UserPreferences>('learning_get_preferences');
      setPreferences(result);
      setEditedPrefs(result);
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
      const defaultPrefs: UserPreferences = {
        language: 'Polish',
        code_language: 'English',
        frameworks: ['React 19', 'TypeScript', 'Zustand', 'Tauri'],
        coding_style: 'functional, strict TypeScript, no-any',
        persona: 'Jaskier',
      };
      setPreferences(defaultPrefs);
      setEditedPrefs(defaultPrefs);
    }
  }, []);

  const fetchTrainingExamples = useCallback(async () => {
    try {
      const result = await invoke<TrainingExample[]>('learning_get_training_examples', {
        limit: 20,
      });
      setTrainingExamples(result);
    } catch (err) {
      console.error('Failed to fetch training examples:', err);
      setTrainingExamples([]);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStats();
    fetchPreferences();
    fetchTrainingExamples();
  }, [fetchStats, fetchPreferences, fetchTrainingExamples]);

  // ============================================================================
  // Actions
  // ============================================================================

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const results = await invoke<RagDocument[]>('learning_rag_search', {
        query: searchQuery,
        topK: 5,
      });
      setRagResults(results);
    } catch (err) {
      setError(`Search failed: ${err}`);
      setRagResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDocument = async () => {
    if (!addDocContent.trim()) return;
    setAddingDoc(true);
    setError(null);
    try {
      const id = `manual-${Date.now()}`;
      await invoke('learning_rag_add', {
        id,
        content: addDocContent,
        metadata: { source: 'manual', added_via: 'gui' },
      });
      setAddDocContent('');
      setSuccessMsg('Dokument dodany do RAG!');
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchStats();
    } catch (err) {
      setError(`Failed to add document: ${err}`);
    } finally {
      setAddingDoc(false);
    }
  };

  const handleClearRag = async () => {
    if (!confirm('Czy na pewno chcesz wyczyścić całą pamięć RAG?')) return;
    setLoading(true);
    try {
      await invoke('learning_rag_clear');
      setRagResults([]);
      setSuccessMsg('Pamięć RAG wyczyszczona');
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchStats();
    } catch (err) {
      setError(`Clear failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    if (!editedPrefs) return;
    setLoading(true);
    try {
      await invoke('learning_save_preferences', { preferences: editedPrefs });
      setPreferences(editedPrefs);
      setEditingPrefs(false);
      setSuccessMsg('Preferencje zapisane!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(`Save failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      await invoke('learning_export_for_finetune');
      setSuccessMsg('Dane wyeksportowane! Sprawdź folder data/export');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setError(`Export failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePullEmbedding = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg('Pobieranie modelu embedding... To może potrwać kilka minut.');
    try {
      await invoke<string>('learning_pull_embedding_model');
      setSuccessMsg('Model mxbai-embed-large zainstalowany!');
      fetchStats();
    } catch (err) {
      setError(`Pull failed: ${err}`);
      setSuccessMsg(null);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="flex-1 glass-panel flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-matrix-border">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-matrix-accent" />
          <div>
            <h2 className="text-lg font-bold text-matrix-text">Hybrid AI Learning</h2>
            <p className="text-xs text-matrix-text-dim">RAG + Fine-tuning System</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchStats();
              fetchTrainingExamples();
            }}
            className="glass-button p-2"
            title="Odśwież"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="glass-button glass-button-primary flex items-center gap-2 text-sm"
          >
            <Download size={14} />
            Eksportuj
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-4 mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs flex items-center gap-2">
          <X size={14} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto hover:text-red-300">
            <X size={12} />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="mx-4 mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-xs flex items-center gap-2">
          <Check size={14} />
          {successMsg}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Stats Section */}
        <div className="glass-card">
          <SectionHeader
            title="Statystyki"
            icon={Cpu}
            expanded={showStats}
            onToggle={() => setShowStats(!showStats)}
          />
          {showStats && stats && (
            <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="RAG Documents"
                value={stats.rag_documents}
                icon={Database}
                color="text-blue-400"
              />
              <StatCard
                label="RAG Memory"
                value={`${stats.rag_memory_mb.toFixed(2)} MB`}
                icon={Cpu}
                color="text-purple-400"
              />
              <StatCard
                label="Training Examples"
                value={stats.instruction_examples + stats.conversation_examples}
                icon={FileJson}
                color="text-green-400"
              />
              <div className="glass-card p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={14} className="text-yellow-400" />
                  <span className="text-xs text-matrix-text-dim">Embedding Model</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-bold ${
                      stats.embedding_model_available ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {stats.embedding_model_available ? 'OK' : 'Brak'}
                  </span>
                  {!stats.embedding_model_available && (
                    <button
                      onClick={handlePullEmbedding}
                      disabled={loading}
                      className="text-[10px] px-2 py-0.5 bg-matrix-accent/20 text-matrix-accent rounded hover:bg-matrix-accent/30"
                    >
                      Zainstaluj
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RAG Section */}
        <div className="glass-card">
          <SectionHeader
            title="RAG - Semantic Search"
            icon={Search}
            expanded={showRag}
            onToggle={() => setShowRag(!showRag)}
            actions={
              <button
                onClick={handleClearRag}
                className="p-1 hover:bg-red-500/20 rounded text-matrix-text-dim hover:text-red-400"
                title="Wyczyść RAG"
              >
                <Trash2 size={12} />
              </button>
            }
          />
          {showRag && (
            <div className="p-3 space-y-3">
              {/* Search */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    size={14}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-matrix-text-dim"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Szukaj w pamięci semantycznej..."
                    className="glass-input pl-8 w-full text-sm"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  disabled={loading || !searchQuery.trim()}
                  className="glass-button glass-button-primary px-4"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : 'Szukaj'}
                </button>
              </div>

              {/* Results */}
              {ragResults.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-auto">
                  {ragResults.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-2 bg-matrix-bg-primary/50 rounded border border-matrix-border/50 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-matrix-text-dim font-mono">{doc.id}</span>
                        {doc.score && (
                          <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                            {(doc.score * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <p className="text-matrix-text line-clamp-2">{doc.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Document */}
              <div className="pt-2 border-t border-matrix-border/50">
                <p className="text-xs text-matrix-text-dim mb-2">Dodaj wiedzę do RAG:</p>
                <div className="flex gap-2">
                  <textarea
                    value={addDocContent}
                    onChange={(e) => setAddDocContent(e.target.value)}
                    placeholder="Wpisz treść do zapamiętania..."
                    className="glass-input flex-1 text-sm resize-none"
                    rows={2}
                  />
                  <button
                    onClick={handleAddDocument}
                    disabled={addingDoc || !addDocContent.trim()}
                    className="glass-button glass-button-primary px-3"
                  >
                    {addingDoc ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Plus size={14} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Training Data Section */}
        <div className="glass-card">
          <SectionHeader
            title="Training Data"
            icon={BookOpen}
            expanded={showTraining}
            onToggle={() => setShowTraining(!showTraining)}
          />
          {showTraining && (
            <div className="p-3">
              {trainingExamples.length === 0 ? (
                <p className="text-xs text-matrix-text-dim italic">
                  Brak zebranych przykładów. Interakcje będą automatycznie zbierane.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-auto">
                  {trainingExamples.map((ex, i) => (
                    <div
                      key={i}
                      className="p-2 bg-matrix-bg-primary/50 rounded border border-matrix-border/50 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-matrix-accent font-semibold">Instruction</span>
                        <span className="text-[10px] text-matrix-text-dim">
                          {new Date(ex.collected_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-matrix-text mb-2 line-clamp-2">{ex.instruction}</p>
                      <span className="text-green-400 font-semibold">Output</span>
                      <p className="text-matrix-text-dim line-clamp-2">{ex.output}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Preferences Section */}
        <div className="glass-card">
          <SectionHeader
            title="Preferencje użytkownika"
            icon={Settings2}
            expanded={showPreferences}
            onToggle={() => setShowPreferences(!showPreferences)}
            actions={
              !editingPrefs ? (
                <button
                  onClick={() => setEditingPrefs(true)}
                  className="p-1 hover:bg-matrix-accent/20 rounded text-matrix-text-dim hover:text-matrix-accent"
                  title="Edytuj"
                >
                  <Settings2 size={12} />
                </button>
              ) : null
            }
          />
          {showPreferences && preferences && (
            <div className="p-3">
              {editingPrefs && editedPrefs ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-matrix-text-dim">Język (mówiony)</label>
                    <input
                      type="text"
                      value={editedPrefs.language}
                      onChange={(e) => setEditedPrefs({ ...editedPrefs, language: e.target.value })}
                      className="glass-input w-full text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-matrix-text-dim">Język kodu</label>
                    <input
                      type="text"
                      value={editedPrefs.code_language}
                      onChange={(e) =>
                        setEditedPrefs({ ...editedPrefs, code_language: e.target.value })
                      }
                      className="glass-input w-full text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-matrix-text-dim">Frameworki (przecinek)</label>
                    <input
                      type="text"
                      value={editedPrefs.frameworks.join(', ')}
                      onChange={(e) =>
                        setEditedPrefs({
                          ...editedPrefs,
                          frameworks: e.target.value.split(',').map((s) => s.trim()),
                        })
                      }
                      className="glass-input w-full text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-matrix-text-dim">Styl kodowania</label>
                    <input
                      type="text"
                      value={editedPrefs.coding_style}
                      onChange={(e) =>
                        setEditedPrefs({ ...editedPrefs, coding_style: e.target.value })
                      }
                      className="glass-input w-full text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-matrix-text-dim">Persona AI</label>
                    <select
                      value={editedPrefs.persona}
                      onChange={(e) => setEditedPrefs({ ...editedPrefs, persona: e.target.value })}
                      className="glass-input w-full text-sm mt-1"
                    >
                      <option value="Jaskier">Jaskier (ironiczny, roast)</option>
                      <option value="Professional">Professional (konkretny)</option>
                      <option value="Teacher">Teacher (edukacyjny)</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSavePreferences}
                      disabled={loading}
                      className="glass-button glass-button-primary flex-1 flex items-center justify-center gap-2"
                    >
                      <Check size={14} />
                      Zapisz
                    </button>
                    <button
                      onClick={() => {
                        setEditingPrefs(false);
                        setEditedPrefs(preferences);
                      }}
                      className="glass-button flex-1 flex items-center justify-center gap-2"
                    >
                      <X size={14} />
                      Anuluj
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-matrix-text-dim">Język:</span>
                    <span className="ml-2 text-matrix-text">{preferences.language}</span>
                  </div>
                  <div>
                    <span className="text-matrix-text-dim">Kod:</span>
                    <span className="ml-2 text-matrix-text">{preferences.code_language}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-matrix-text-dim">Frameworki:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {preferences.frameworks.map((fw, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 bg-matrix-accent/20 text-matrix-accent rounded text-[10px]"
                        >
                          {fw}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-matrix-text-dim">Styl:</span>
                    <span className="ml-2 text-matrix-text">{preferences.coding_style}</span>
                  </div>
                  <div>
                    <span className="text-matrix-text-dim">Persona:</span>
                    <span className="ml-2 text-matrix-accent">{preferences.persona}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-matrix-border text-[10px] text-matrix-text-dim flex justify-between">
        <span>Hybrid AI Learning System v1.0</span>
        <span>RAG (real-time) + Fine-tuning (monthly)</span>
      </div>
    </div>
  );
}
