import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';

interface AiResponse {
  success: boolean;
  content: string;
  error: string | null;
  duration_ms: number;
  provider: string;
  model: string | null;
  complexity: number | null;
  cost_saved: number | null;
}

interface SwarmTask {
  id: string;
  prompt: string;
  status: 'Pending' | 'Running' | 'Completed' | 'Failed';
  provider: string | null;
}

interface ProviderHealth {
  ollama: boolean;
  ollama_models: string[];
  gemini: boolean;
  gemini_path: string;
}

interface StreamEvent {
  event_type: string; // "start", "chunk", "step", "complete", "error"
  content: string;
  provider: string | null;
  model: string | null;
  step: string | null;
  progress: number | null;
}

type Mode = 'hydra' | 'ollama' | 'gemini' | 'swarm';

function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [swarmTasks, setSwarmTasks] = useState<SwarmTask[]>([]);
  const [mode, setMode] = useState<Mode>('hydra');
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [complexity, setComplexity] = useState<number | null>(null);
  const [costSaved, setCostSaved] = useState<number | null>(null);
  const [totalSaved, setTotalSaved] = useState(0);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const responseRef = useRef<HTMLPreElement>(null);

  // Health check on mount
  useEffect(() => {
    invoke<ProviderHealth>('health_check')
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  // Listen for stream events
  useEffect(() => {
    const unlisten = listen<StreamEvent>('stream', (event) => {
      const data = event.payload;

      switch (data.event_type) {
        case 'start':
          setStreaming(true);
          setResponse('');
          setCurrentStep(data.step);
          setProgress(data.progress || 0);
          break;

        case 'step':
          setCurrentStep(data.step);
          setProgress(data.progress || 0);
          if (data.provider) setLastProvider(data.provider);
          if (data.model) setLastModel(data.model);
          break;

        case 'chunk':
          setResponse((prev) => prev + data.content);
          // Auto-scroll to bottom
          if (responseRef.current) {
            responseRef.current.scrollTop = responseRef.current.scrollHeight;
          }
          break;

        case 'complete':
          setStreaming(false);
          setCurrentStep(null);
          setProgress(100);
          break;

        case 'error':
          setStreaming(false);
          setError(data.content);
          setCurrentStep(null);
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for swarm task completion
  useEffect(() => {
    const unlisten = listen<[string, AiResponse]>('swarm-task-complete', (event) => {
      const [id, result] = event.payload;
      setSwarmTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, status: result.success ? 'Completed' : 'Failed', provider: result.provider }
            : t,
        ),
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResponse('');
    setDuration(null);
    setLastProvider(null);
    setLastModel(null);
    setComplexity(null);
    setCostSaved(null);
    setCurrentStep(null);
    setProgress(0);

    try {
      let result: AiResponse;

      if (mode === 'hydra') {
        // Use streaming version
        result = await invoke<AiResponse>('hydra_query_stream', { prompt });
      } else if (mode === 'ollama') {
        result = await invoke<AiResponse>('ollama_query', { prompt });
      } else {
        result = await invoke<AiResponse>('gemini_query', { prompt });
      }

      if (result.success) {
        // If not streaming, set response directly
        if (!streaming) {
          setResponse(result.content);
        }
        setDuration(result.duration_ms);
        setLastProvider(result.provider);
        setLastModel(result.model);
        setComplexity(result.complexity);
        setCostSaved(result.cost_saved);
        if (result.cost_saved) {
          setTotalSaved((prev) => prev + result.cost_saved!);
        }
      } else {
        setError(result.error || 'Unknown error');
      }

      if (result.error && result.success) {
        console.warn('Fallback used:', result.error);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }, [prompt, loading, mode, streaming]);

  const handleSwarmAdd = useCallback(async () => {
    if (!prompt.trim()) return;

    const id = `task-${Date.now()}`;
    try {
      await invoke('swarm_add_task', { id, prompt });
      setSwarmTasks((prev) => [
        ...prev,
        { id, prompt, status: 'Pending' as const, provider: null },
      ]);
      setPrompt('');
    } catch (e) {
      setError(String(e));
    }
  }, [prompt]);

  const handleSwarmExecute = useCallback(async () => {
    if (swarmTasks.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const results = await invoke<AiResponse[]>('swarm_execute');
      setResponse(
        results.map((r, i) => `--- Task ${i + 1} [${r.provider}] ---\n${r.content}`).join('\n\n'),
      );

      const saved = results.reduce((acc, r) => acc + (r.cost_saved || 0), 0);
      if (saved > 0) {
        setTotalSaved((prev) => prev + saved);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [swarmTasks]);

  const handleSwarmClear = useCallback(async () => {
    await invoke('swarm_clear');
    setSwarmTasks([]);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (mode === 'swarm') {
          handleSwarmAdd();
        } else {
          handleSubmit();
        }
      }
    },
    [mode, handleSwarmAdd, handleSubmit],
  );

  const getModeIcon = (m: Mode) => {
    switch (m) {
      case 'hydra':
        return '🐙';
      case 'ollama':
        return '🦙';
      case 'gemini':
        return '💎';
      case 'swarm':
        return '🐝';
    }
  };

  const getModeLabel = (m: Mode) => {
    switch (m) {
      case 'hydra':
        return 'HYDRA (Auto)';
      case 'ollama':
        return 'Ollama (Local)';
      case 'gemini':
        return 'Gemini (Cloud)';
      case 'swarm':
        return 'Swarm (Parallel)';
    }
  };

  return (
    <main className="app">
      <header className="header">
        <h1>🐙 HYDRA</h1>
        <div className="status">
          <span className={`health-dot ${health?.ollama ? 'ok' : 'err'}`} title="Ollama">
            🦙
          </span>
          <span className={`health-dot ${health?.gemini ? 'ok' : 'err'}`} title="Gemini">
            💎
          </span>
          {totalSaved > 0 && (
            <span className="savings" title="Total cost saved">
              💰 ${totalSaved.toFixed(4)}
            </span>
          )}
        </div>
      </header>

      <div className="mode-selector">
        {(['hydra', 'ollama', 'gemini', 'swarm'] as Mode[]).map((m) => (
          <button
            key={m}
            className={`mode-btn ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
            disabled={m === 'ollama' && !health?.ollama}
          >
            {getModeIcon(m)} {getModeLabel(m)}
          </button>
        ))}
      </div>

      <div className="input-area">
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === 'swarm'
              ? 'Enter prompt and press Enter to add to swarm...'
              : `Ask ${mode === 'hydra' ? 'HYDRA' : mode}...`
          }
          disabled={loading || streaming}
          rows={3}
        />
        <div className="actions">
          {mode === 'swarm' ? (
            <>
              <button onClick={handleSwarmAdd} disabled={!prompt.trim()}>
                + Add
              </button>
              <button
                onClick={handleSwarmExecute}
                disabled={swarmTasks.length === 0 || loading}
                className="primary"
              >
                {loading ? 'Running...' : `Execute (${swarmTasks.length})`}
              </button>
              <button onClick={handleSwarmClear} disabled={loading}>
                Clear
              </button>
            </>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim() || loading || streaming}
              className="primary"
            >
              {streaming ? 'Streaming...' : loading ? 'Thinking...' : 'Send'}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar during streaming */}
      {(streaming || currentStep) && (
        <div className="stream-status">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="step-info">
            {currentStep && <span className="step">{currentStep}</span>}
            {lastProvider && (
              <span className={`provider-badge ${lastProvider}`}>
                {lastProvider === 'ollama' ? '🦙' : '💎'} {lastProvider}
              </span>
            )}
          </div>
        </div>
      )}

      {mode === 'swarm' && swarmTasks.length > 0 && (
        <div className="swarm-queue">
          <h3>Swarm Queue</h3>
          {swarmTasks.map((task) => (
            <div key={task.id} className={`task ${task.status.toLowerCase()}`}>
              <span className="status-icon">
                {task.status === 'Pending' && '⏳'}
                {task.status === 'Running' && '🔄'}
                {task.status === 'Completed' && '✅'}
                {task.status === 'Failed' && '❌'}
              </span>
              <span className="prompt">{task.prompt.slice(0, 50)}...</span>
              {task.provider && <span className="provider-tag">{task.provider}</span>}
            </div>
          ))}
        </div>
      )}

      {error && <div className="error">❌ {error}</div>}

      {(response || streaming) && (
        <div className="response">
          <div className="response-header">
            <span>Response {streaming && <span className="streaming-dot">●</span>}</span>
            <div className="response-meta">
              {lastProvider && (
                <span className={`provider-badge ${lastProvider}`}>
                  {lastProvider === 'ollama' ? '🦙' : '💎'} {lastProvider}
                </span>
              )}
              {lastModel && <span className="model">{lastModel}</span>}
              {complexity && (
                <span className="complexity" title="Complexity">
                  {'⭐'.repeat(complexity)}
                </span>
              )}
              {duration && <span className="duration">{duration}ms</span>}
              {costSaved && costSaved > 0 && (
                <span className="cost-saved">💰 ${costSaved.toFixed(4)}</span>
              )}
            </div>
          </div>
          <pre ref={responseRef}>
            {response}
            {streaming && <span className="cursor">▌</span>}
          </pre>
        </div>
      )}

      {health && (
        <footer className="footer">
          <span>Ollama: {health.ollama ? `✓ (${health.ollama_models.length} models)` : '✗'}</span>
          <span>Gemini: {health.gemini ? '✓' : '✗'}</span>
        </footer>
      )}
    </main>
  );
}

export default App;
