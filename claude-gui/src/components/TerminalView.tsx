import { useEffect, useRef, useState } from 'react';
import { Send, Trash2, Zap } from 'lucide-react';
import { useClaudeStore } from '../stores/claudeStore';
import { useClaude } from '../hooks/useClaude';
import { ApprovalDialog } from './ApprovalDialog';
import { claudeIpc } from '../lib/ipc';

export function TerminalView() {
  const { outputLines, clearOutput } = useClaudeStore();
  const { status, sendInput, pendingApproval } = useClaude();
  const [input, setInput] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputLines]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[INPUT] Submit:', { input: input.trim(), is_active: status.is_active, status });
    if (input.trim() && status.is_active) {
      console.log('[INPUT] Sending:', input.trim());
      sendInput(input.trim());
      setInput('');
    } else {
      console.log('[INPUT] Blocked - input empty or session not active');
    }
  };

  // Direct test - bypass all checks
  const handleDirectTest = async () => {
    console.log('[DIRECT TEST] Starting...');
    try {
      const status = await claudeIpc.getStatus();
      console.log('[DIRECT TEST] Status:', status);

      if (status.is_active) {
        console.log('[DIRECT TEST] Sending "test" directly...');
        await claudeIpc.sendInput('test\n');
        console.log('[DIRECT TEST] Sent successfully!');
      } else {
        console.log('[DIRECT TEST] Session not active, starting...');
        await claudeIpc.startSession(
          'C:\\Users\\BIURODOM\\Desktop\\ClaudeHydra',
          'C:\\Users\\BIURODOM\\Desktop\\ClaudeHydra\\bin\\claude-code\\cli.js',
          'test'
        );
        console.log('[DIRECT TEST] Session started!');
      }
    } catch (error) {
      console.error('[DIRECT TEST] Error:', error);
    }
  };

  const getLineClass = (type: string) => {
    switch (type) {
      case 'assistant':
        return 'text-matrix-accent';
      case 'tool':
        return 'text-blue-400';
      case 'error':
        return 'text-red-400';
      case 'system':
        return 'text-yellow-400';
      case 'approval':
        return 'text-orange-400 font-semibold';
      default:
        return 'text-matrix-text';
    }
  };

  const getLinePrefix = (type: string) => {
    switch (type) {
      case 'assistant':
        return '◆';
      case 'tool':
        return '⚙';
      case 'error':
        return '✗';
      case 'system':
        return '●';
      case 'approval':
        return '⚠';
      default:
        return '›';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Terminal Output */}
      <div className="flex-1 glass-panel p-4 overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs text-matrix-text-dim">Output</span>
          <button
            onClick={clearOutput}
            className="text-matrix-text-dim hover:text-matrix-accent transition-colors"
            title="Clear output"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto font-mono text-sm space-y-1 terminal-container p-3"
        >
          {outputLines.length === 0 ? (
            <div className="text-matrix-text-dim text-center py-8">
              <p>No output yet.</p>
              <p className="text-xs mt-2">Start a session to begin.</p>
            </div>
          ) : (
            outputLines.map((line) => (
              <div key={line.id} className="flex gap-2">
                <span className={`flex-shrink-0 ${getLineClass(line.type)}`}>
                  {getLinePrefix(line.type)}
                </span>
                <span className={getLineClass(line.type)}>
                  {line.content}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="mt-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              status.is_active
                ? 'Type a message or command...'
                : 'Start a session first'
            }
            disabled={!status.is_active}
            className="flex-1 glass-input"
          />
          <button
            type="submit"
            disabled={!status.is_active || !input.trim()}
            className="glass-button glass-button-primary px-4"
          >
            <Send size={16} />
          </button>
          <button
            type="button"
            onClick={handleDirectTest}
            className="glass-button px-4 bg-yellow-600 hover:bg-yellow-500"
            title="Direct IPC Test"
          >
            <Zap size={16} />
          </button>
        </div>
      </form>

      {/* Approval Dialog */}
      {pendingApproval && <ApprovalDialog />}
    </div>
  );
}
