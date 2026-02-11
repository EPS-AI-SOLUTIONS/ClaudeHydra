import { Bot, Cpu, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useClaude } from '../hooks/useClaude';
import { useClaudeStore } from '../stores/claudeStore';
import { ApprovalDialog } from './ApprovalDialog';

export function TerminalView() {
  const { outputLines } = useClaudeStore();
  const { status, sendInput, pendingApproval } = useClaude();
  const [input, setInput] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new lines arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: outputLines triggers scroll on new messages
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

  const getLineClass = (type: string) => {
    switch (type) {
      case 'assistant':
        return 'text-matrix-text';
      case 'tool':
        return 'text-blue-300';
      case 'error':
        return 'text-red-400';
      case 'system':
        return 'text-matrix-text-dim';
      case 'approval':
        return 'text-orange-300 font-semibold';
      default:
        return 'text-matrix-text';
    }
  };

  const getBubbleStyle = (type: string) => {
    switch (type) {
      case 'assistant':
        return 'bg-matrix-accent/10 border border-matrix-accent/20 ml-0 mr-8';
      case 'tool':
        return 'bg-blue-500/10 border border-blue-500/20 mx-4';
      case 'error':
        return 'bg-red-500/10 border border-red-500/20 mx-4';
      case 'system':
        return 'bg-white/5 border border-white/10 mx-auto max-w-[90%] text-center';
      case 'approval':
        return 'bg-orange-500/10 border border-orange-500/20 mx-4';
      default:
        return 'bg-matrix-accent/5 border border-matrix-accent/10 ml-8 mr-0';
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

  // Model badge icon & color based on model name
  const getModelBadge = (model?: string) => {
    if (!model) return null;
    const m = model.toLowerCase();
    if (m.includes('claude')) {
      return {
        icon: Sparkles,
        label: model,
        color: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
      };
    }
    if (m.includes('gpt') || m.includes('openai')) {
      return {
        icon: Bot,
        label: model,
        color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
      };
    }
    if (m.includes('gemini') || m.includes('google')) {
      return { icon: Bot, label: model, color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' };
    }
    // Ollama / local models
    return {
      icon: Cpu,
      label: model,
      color: 'text-matrix-accent bg-matrix-accent/15 border-matrix-accent/30',
    };
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Output */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div ref={outputRef} className="flex-1 overflow-y-auto text-sm space-y-2 p-3">
          {outputLines.length === 0 ? (
            <div className="text-matrix-text-dim text-center py-8">
              <p>Brak wiadomości.</p>
              <p className="text-xs mt-2">Rozpocznij rozmowę poniżej.</p>
            </div>
          ) : (
            outputLines.map((line) => {
              const badge = getModelBadge(line.model);
              return (
                <div key={line.id} className={`rounded-xl px-3 py-2 ${getBubbleStyle(line.type)}`}>
                  {/* Model badge row */}
                  {badge && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <badge.icon size={10} className={badge.color.split(' ')[0]} />
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-[9px] text-matrix-text-dim">
                        {line.timestamp.toLocaleTimeString('pl-PL', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-2 items-start">
                    <span className={`flex-shrink-0 text-xs mt-0.5 ${getLineClass(line.type)}`}>
                      {getLinePrefix(line.type)}
                    </span>
                    <span className={`${getLineClass(line.type)} break-words whitespace-pre-wrap`}>
                      {line.content}
                    </span>
                  </div>
                </div>
              );
            })
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
              status.is_active ? 'Type a message or command...' : 'Start a session first'
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
        </div>
      </form>

      {/* Approval Dialog */}
      {pendingApproval && <ApprovalDialog />}
    </div>
  );
}
