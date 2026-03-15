/**
 * SandboxPanel — Isolated code execution environment for AI agents
 *
 * Provides a code editor, language selector, execution controls, and output
 * display. Integrates with the Swarm for CI-like test-before-apply workflows.
 */

import { Box, CheckCircle2, Clock, Container, Loader2, Play, Plus, Shield, Trash2, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useState } from 'react';
import { type SandboxExecution, type SandboxLanguage, type SandboxSession, useSandbox } from '../hooks/useSandbox';

// ── Language Config ──────────────────────────────────────────────────────────

const LANGUAGES: { id: SandboxLanguage; label: string; color: string; icon: string }[] = [
  { id: 'node', label: 'Node.js', color: '#22c55e', icon: 'JS' },
  { id: 'python', label: 'Python', color: '#3b82f6', icon: 'PY' },
  { id: 'rust', label: 'Rust', color: '#f59e0b', icon: 'RS' },
  { id: 'bash', label: 'Bash', color: '#a855f7', icon: 'SH' },
];

const EXAMPLE_CODE: Record<SandboxLanguage, string> = {
  node: `const data = [3, 1, 4, 1, 5, 9, 2, 6];
const sorted = [...data].sort((a, b) => a - b);
console.log('Sorted:', sorted);
console.log('Sum:', data.reduce((a, b) => a + b, 0));`,
  python: `data = [3, 1, 4, 1, 5, 9, 2, 6]
print(f"Sorted: {sorted(data)}")
print(f"Sum: {sum(data)}")
print(f"Mean: {sum(data)/len(data):.2f}")`,
  rust: `fn main() {
    let data = vec![3, 1, 4, 1, 5, 9, 2, 6];
    let sum: i32 = data.iter().sum();
    println!("Sum: {}", sum);
    println!("Count: {}", data.len());
}`,
  bash: `echo "System info:"
uname -a
echo "---"
echo "Files in /tmp:"
ls -la /tmp/ 2>/dev/null || echo "(empty)"`,
};

// ── Main Component ───────────────────────────────────────────────────────────

export function SandboxPanel() {
  const {
    sessions,
    executions,
    health,
    stats,
    latestExecution,
    isCreating,
    isExecuting,
    createSession,
    executeCode,
    destroySession,
  } = useSandbox();

  const [language, setLanguage] = useState<SandboxLanguage>('node');
  const [code, setCode] = useState(EXAMPLE_CODE.node);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);

  // ── Execute handler ──────────────────────────────────────────────────────

  const handleExecute = useCallback(async () => {
    if (!code.trim()) return;
    await executeCode(code, language, activeSessionId ?? undefined);
  }, [code, language, activeSessionId, executeCode]);

  // ── Create session handler ───────────────────────────────────────────────

  const handleCreateSession = useCallback(async () => {
    const session = await createSession(language);
    if (session) {
      setActiveSessionId(session.id);
    }
  }, [language, createSession]);

  // ── Language change ──────────────────────────────────────────────────────

  const handleLanguageChange = useCallback((lang: SandboxLanguage) => {
    setLanguage(lang);
    setCode(EXAMPLE_CODE[lang]);
    setActiveSessionId(null); // Clear session when language changes
  }, []);

  return (
    <div style={{ display: 'flex', height: '100%', background: '#0a0a0f' }}>
      {/* ── Main editor area ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* ── Top bar ────────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 16px',
            borderBottom: '1px solid #1e293b',
            background: '#0f172a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Shield size={16} color="#10b981" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Sandbox</span>
          </div>

          <div style={{ width: '1px', height: '20px', background: '#334155' }} />

          {/* Docker status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Container size={14} color={health?.docker_available ? '#22c55e' : '#f59e0b'} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {health?.docker_available ? 'Docker' : 'Fallback'}
            </span>
          </div>

          {/* Stats */}
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            {stats.activeSessions} sessions · {stats.totalExecutions} runs · {stats.successRate}% pass
          </span>

          <div style={{ flex: 1 }} />

          {/* Session toggle */}
          <button
            type="button"
            onClick={() => setShowSessions(!showSessions)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              background: showSessions ? '#1e293b' : 'transparent',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#94a3b8',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            <Box size={12} />
            Sessions ({sessions.length})
          </button>
        </div>

        {/* ── Language selector ──────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            padding: '8px 16px',
            borderBottom: '1px solid #1e293b',
          }}
        >
          {LANGUAGES.map((lang) => (
            <button
              type="button"
              key={lang.id}
              onClick={() => handleLanguageChange(lang.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: language === lang.id ? 600 : 400,
                border: `1px solid ${language === lang.id ? lang.color : '#334155'}`,
                background: language === lang.id ? `${lang.color}15` : 'transparent',
                color: language === lang.id ? lang.color : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '1px 4px',
                  borderRadius: '3px',
                  background: language === lang.id ? `${lang.color}30` : '#1e293b',
                  color: language === lang.id ? lang.color : '#64748b',
                }}
              >
                {lang.icon}
              </span>
              {lang.label}
            </button>
          ))}

          <div style={{ flex: 1 }} />

          {/* Active session indicator */}
          {activeSessionId && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: '#052e16',
                border: '1px solid #22c55e33',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#22c55e',
              }}
            >
              <Container size={12} />
              Session active
              <button
                type="button"
                onClick={() => setActiveSessionId(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#22c55e',
                  cursor: 'pointer',
                  padding: '0 2px',
                  fontSize: '14px',
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* Create session button */}
          <button
            type="button"
            onClick={handleCreateSession}
            disabled={isCreating}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#e2e8f0',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            {isCreating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            New Session
          </button>
        </div>

        {/* ── Code editor ───────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter code to execute in sandbox..."
            spellCheck={false}
            style={{
              flex: 1,
              width: '100%',
              background: '#0a0a0f',
              color: '#e2e8f0',
              border: 'none',
              padding: '16px',
              fontSize: '13px',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              lineHeight: 1.6,
              resize: 'none',
              outline: 'none',
              tabSize: 2,
            }}
            onKeyDown={(e) => {
              // Ctrl+Enter to execute
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleExecute();
              }
              // Tab inserts spaces
              if (e.key === 'Tab') {
                e.preventDefault();
                const target = e.target as HTMLTextAreaElement;
                const start = target.selectionStart;
                const end = target.selectionEnd;
                setCode(`${code.substring(0, start)}  ${code.substring(end)}`);
                // Restore cursor position after React re-render
                requestAnimationFrame(() => {
                  target.selectionStart = target.selectionEnd = start + 2;
                });
              }
            }}
          />

          {/* ── Execute bar ─────────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderTop: '1px solid #1e293b',
              background: '#0f172a',
            }}
          >
            <button
              type="button"
              onClick={handleExecute}
              disabled={isExecuting || !code.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 16px',
                background: isExecuting ? '#1e293b' : '#10b981',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isExecuting ? 'not-allowed' : 'pointer',
              }}
            >
              {isExecuting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play size={14} />
                  Run (Ctrl+Enter)
                </>
              )}
            </button>

            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {code.length} chars · {language}
              {activeSessionId ? ' · persistent session' : ' · ephemeral'}
            </span>
          </div>
        </div>

        {/* ── Output panel ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {latestExecution && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{
                borderTop: '1px solid #1e293b',
                background: '#0f172a',
                maxHeight: '300px',
                overflow: 'auto',
              }}
            >
              <ExecutionOutput execution={latestExecution} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Sessions sidebar ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSessions && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            style={{
              borderLeft: '1px solid #1e293b',
              background: '#0f172a',
              overflow: 'auto',
            }}
          >
            <div style={{ padding: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '10px' }}>
                Sandbox Sessions
              </div>

              {sessions.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '20px 0' }}>
                  No active sessions. Click "New Session" to create one.
                </div>
              ) : (
                sessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    onSelect={() => {
                      setActiveSessionId(session.id);
                      setLanguage(session.language);
                    }}
                    onDestroy={() => {
                      destroySession(session.id);
                      if (activeSessionId === session.id) {
                        setActiveSessionId(null);
                      }
                    }}
                  />
                ))
              )}

              {/* Recent executions */}
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#e2e8f0',
                  marginTop: '16px',
                  marginBottom: '10px',
                }}
              >
                Recent Executions
              </div>
              {executions.slice(0, 20).map((exec) => (
                <ExecutionRow key={exec.id} execution={exec} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ExecutionOutput({ execution }: { execution: SandboxExecution }) {
  const isSuccess = execution.status === 'success';
  const isTimeout = execution.status === 'timeout';

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        {isSuccess ? (
          <CheckCircle2 size={14} color="#22c55e" />
        ) : isTimeout ? (
          <Clock size={14} color="#f59e0b" />
        ) : (
          <XCircle size={14} color="#ef4444" />
        )}
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: isSuccess ? '#22c55e' : isTimeout ? '#f59e0b' : '#ef4444',
          }}
        >
          {isSuccess ? 'Success' : isTimeout ? 'Timeout' : 'Error'}
        </span>
        <span style={{ fontSize: '11px', color: '#64748b' }}>
          exit: {execution.exit_code ?? '—'} · {execution.duration_ms}ms · {execution.language}
        </span>
      </div>

      {/* stdout */}
      {execution.stdout && (
        <div style={{ marginBottom: '8px' }}>
          <div
            style={{
              fontSize: '10px',
              color: '#64748b',
              marginBottom: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            stdout
          </div>
          <pre
            style={{
              background: '#0a0a0f',
              border: '1px solid #1e293b',
              borderLeft: '3px solid #22c55e',
              borderRadius: '4px',
              padding: '8px 12px',
              fontSize: '12px',
              fontFamily: "'JetBrains Mono', monospace",
              color: '#e2e8f0',
              whiteSpace: 'pre-wrap',
              margin: 0,
              maxHeight: '150px',
              overflow: 'auto',
            }}
          >
            {execution.stdout}
          </pre>
        </div>
      )}

      {/* stderr */}
      {execution.stderr && (
        <div>
          <div
            style={{
              fontSize: '10px',
              color: '#64748b',
              marginBottom: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            stderr
          </div>
          <pre
            style={{
              background: '#0a0a0f',
              border: '1px solid #1e293b',
              borderLeft: '3px solid #ef4444',
              borderRadius: '4px',
              padding: '8px 12px',
              fontSize: '12px',
              fontFamily: "'JetBrains Mono', monospace",
              color: '#f87171',
              whiteSpace: 'pre-wrap',
              margin: 0,
              maxHeight: '150px',
              overflow: 'auto',
            }}
          >
            {execution.stderr}
          </pre>
        </div>
      )}
    </div>
  );
}

function SessionCard({
  session,
  isActive,
  onSelect,
  onDestroy,
}: {
  session: SandboxSession;
  isActive: boolean;
  onSelect: () => void;
  onDestroy: () => void;
}) {
  const langConfig = LANGUAGES.find((l) => l.id === session.language);

  return (
    <button
      type="button"
      style={{
        padding: '8px 10px',
        marginBottom: '6px',
        background: isActive ? '#1e293b' : '#0f172a',
        border: `1px solid ${isActive ? '#3b82f6' : '#1e293b'}`,
        borderRadius: '8px',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        color: 'inherit',
      }}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '1px 4px',
              borderRadius: '3px',
              background: `${langConfig?.color ?? '#6b7280'}30`,
              color: langConfig?.color ?? '#6b7280',
            }}
          >
            {langConfig?.icon ?? '?'}
          </span>
          <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: isActive ? 600 : 400 }}>
            {session.id.slice(0, 8)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: session.status === 'ready' ? '#22c55e' : '#6b7280',
            }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDestroy();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
        {session.execution_count} runs
        {session.container_id ? ' · Docker' : ' · fallback'}
        {session.resource_limits.memory_mb && ` · ${session.resource_limits.memory_mb}MB`}
      </div>
    </button>
  );
}

function ExecutionRow({ execution }: { execution: SandboxExecution }) {
  const isSuccess = execution.status === 'success';
  const langConfig = LANGUAGES.find((l) => l.id === execution.language);

  return (
    <div
      style={{
        padding: '6px 8px',
        marginBottom: '4px',
        borderRadius: '6px',
        background: '#1e293b',
        borderLeft: `2px solid ${isSuccess ? '#22c55e' : '#ef4444'}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {isSuccess ? <CheckCircle2 size={10} color="#22c55e" /> : <XCircle size={10} color="#ef4444" />}
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '0px 3px',
              borderRadius: '2px',
              background: `${langConfig?.color ?? '#6b7280'}20`,
              color: langConfig?.color ?? '#6b7280',
            }}
          >
            {langConfig?.icon ?? '?'}
          </span>
        </div>
        <span style={{ fontSize: '10px', color: '#64748b' }}>{execution.duration_ms}ms</span>
      </div>
      <div
        style={{
          fontSize: '10px',
          color: '#94a3b8',
          marginTop: '2px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {execution.code.slice(0, 60)}
        {execution.code.length > 60 && '...'}
      </div>
    </div>
  );
}
