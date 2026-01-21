import { useState, useRef, useEffect, useCallback, DragEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Check if running in Tauri (v2 uses __TAURI_INTERNALS__)
const isTauri = () => typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

// Browser fallback API (uses Vite proxy to bypass CORS)
const OLLAMA_PROXY = '/api/ollama';

const browserOllamaApi = {
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_PROXY}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  },

  async listModels(): Promise<OllamaModel[]> {
    const res = await fetch(`${OLLAMA_PROXY}/api/tags`);
    if (!res.ok) throw new Error('Failed to fetch models');
    const data = await res.json();
    return data.models || [];
  },

  async* streamChat(model: string, messages: Array<{role: string; content: string}>): AsyncGenerator<StreamChunk> {
    let res: Response;
    try {
      res = await fetch(`${OLLAMA_PROXY}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true }),
      });
    } catch (e) {
      console.error('[OllamaChat] Fetch error:', e);
      throw new Error(`Connection failed: ${e}`);
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error('[OllamaChat] Response not OK:', res.status, errorText);
      throw new Error(`Chat request failed: ${res.status} ${errorText}`);
    }

    if (!res.body) {
      console.error('[OllamaChat] Response body is null');
      throw new Error('Response body is null - streaming not supported');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          yield {
            id: crypto.randomUUID(),
            token: chunk.message?.content || '',
            done: chunk.done || false,
            model: chunk.model,
            total_tokens: chunk.eval_count,
          };
        } catch { /* ignore parse errors */ }
      }
    }
  }
};
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  FileText,
  X,
  Bot,
  User,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useChatHistory } from '../hooks/useChatHistory';
import { usePromptPipeline, getAlzurStatus } from '../hooks/usePromptPipeline';
import { CodeBlock, InlineCode } from './CodeBlock';

interface OllamaModel {
  name: string;
  modified_at?: string;
  size?: number;
}

interface StreamChunk {
  id: string;
  token: string;
  done: boolean;
  model?: string;
  total_tokens?: number;
}

interface Attachment {
  id: string;
  name: string;
  type: 'file' | 'image';
  content: string; // base64 or text content
  mimeType: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Attachment[];
  timestamp: Date;
  model?: string;
  streaming?: boolean;
}

export function OllamaChatView() {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [alzurStatus, setAlzurStatus] = useState({ samples: 0, buffer: 0, isTraining: false, modelVersion: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const { currentSession, createSession, addMessage: saveChatMessage } = useChatHistory();
  const { processPrompt } = usePromptPipeline();

  // Load models on mount - prefer Alzur-trained models
  // Works in both Tauri and browser mode (via proxy)
  useEffect(() => {
    const loadModels = async () => {
      try {
        let isHealthy: boolean;
        let result: OllamaModel[];

        if (isTauri()) {
          // Tauri mode: use IPC
          isHealthy = await invoke<boolean>('ollama_health_check');
          if (isHealthy) {
            result = await invoke<OllamaModel[]>('ollama_list_models');
          } else {
            result = [];
          }
        } else {
          // Browser mode: use fetch via Vite proxy
          console.log('[OllamaChat] Browser mode - using proxy');
          isHealthy = await browserOllamaApi.healthCheck();
          if (isHealthy) {
            result = await browserOllamaApi.listModels();
          } else {
            result = [];
          }
        }

        setOllamaConnected(isHealthy);
        if (isHealthy && result.length > 0) {
          setModels(result);

          if (!selectedModel) {
            // AUTO-SELECT: Prefer latest Alzur-trained model if available
            const alzurModels = result
              .filter(m => m.name.startsWith('alzur-v'))
              .sort((a, b) => {
                // Sort by version number descending
                const vA = parseInt(a.name.replace('alzur-v', '')) || 0;
                const vB = parseInt(b.name.replace('alzur-v', '')) || 0;
                return vB - vA;
              });

            if (alzurModels.length > 0) {
              // Use latest Alzur model (continuous learning result)
              setSelectedModel(alzurModels[0].name);
              console.log(`[Alzur] Auto-selected trained model: ${alzurModels[0].name}`);
            } else {
              // Fallback to first available model
              setSelectedModel(result[0].name);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load models:', e);
        setOllamaConnected(false);
      }
    };
    loadModels();
  }, [selectedModel]);

  // Reference to capture final response for Vilgefortz
  const responseBufferRef = useRef<string>('');
  const lastUserPromptRef = useRef<string>('');

  // Listen for streaming chunks with Vilgefortz post-processing
  useEffect(() => {
    if (!isTauri()) return; // Skip in browser mode

    const unlisten = listen<StreamChunk>('ollama-stream-chunk', async (event) => {
      const chunk = event.payload;

      // Accumulate response
      responseBufferRef.current += chunk.token;

      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.streaming) {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMsg,
              content: lastMsg.content + chunk.token,
              streaming: !chunk.done,
            },
          ];
        }
        return prev;
      });

      if (chunk.done) {
        setIsLoading(false);

        // ═══════════════════════════════════════════════════════════════
        // VILGEFORTZ POST-PROCESSING: Analyze & Learn from response
        // ═══════════════════════════════════════════════════════════════
        const finalResponse = responseBufferRef.current;
        const userPrompt = lastUserPromptRef.current;

        if (finalResponse && userPrompt) {
          // Trigger Vilgefortz analysis (async, non-blocking)
          try {
            await invoke('add_agent_memory', {
              agent: 'Vilgefortz',
              entryType: 'context',
              content: `[Session Analysis]\nPrompt: ${userPrompt.slice(0, 100)}...\nResponse length: ${finalResponse.length} chars\nModel: ${selectedModel}\nTimestamp: ${new Date().toISOString()}`,
              tags: 'session,analysis,auto-learn',
            });
          } catch {
            // Silent fail - learning is non-critical
          }
        }

        // Reset buffer
        responseBufferRef.current = '';
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [selectedModel]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update Alzur status periodically
  useEffect(() => {
    const updateAlzurStatus = () => {
      setAlzurStatus(getAlzurStatus());
    };
    updateAlzurStatus();
    const interval = setInterval(updateAlzurStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  // Handle file drop
  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await processFile(file);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Process uploaded file
  const processFile = async (file: File) => {
    const reader = new FileReader();

    return new Promise<void>((resolve) => {
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const isImage = file.type.startsWith('image/');

        const attachment: Attachment = {
          id: crypto.randomUUID(),
          name: file.name,
          type: isImage ? 'image' : 'file',
          content, // base64 for images, text for files
          mimeType: file.type,
        };

        setAttachments((prev) => [...prev, attachment]);
        resolve();
      };

      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  // Handle file input
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (const file of Array.from(files)) {
        await processFile(file);
      }
    }
  };

  // Remove attachment
  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Send message with AI Pipeline (Avallac'h → AI → Vilgefortz)
  const sendMessage = async () => {
    if ((!input.trim() && attachments.length === 0) || !selectedModel || isLoading) return;

    // Build message content
    let content = input;

    // Add file contents to message
    for (const att of attachments) {
      if (att.type === 'file') {
        content += `\n\n--- File: ${att.name} ---\n${att.content}`;
      }
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      attachments: [...attachments],
      timestamp: new Date(),
    };

    // Create session if needed
    let sessionId = currentSession?.id;
    if (!sessionId) {
      const session = await createSession(`Chat ${new Date().toLocaleString('pl-PL')}`);
      sessionId = session?.id;
    }

    // Save user message
    if (sessionId) {
      await saveChatMessage(sessionId, 'user', content, selectedModel);
    }

    // Add user message
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    // Store prompt for Vilgefortz post-processing
    lastUserPromptRef.current = content;

    // Add placeholder for assistant response
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      model: selectedModel,
      streaming: true,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // Build chat messages for API
      const chatMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Check if any image attachments (for vision models)
      const hasImages = attachments.some((a) => a.type === 'image');
      let finalContent = content;

      if (hasImages) {
        const imageNames = attachments
          .filter((a) => a.type === 'image')
          .map((a) => a.name)
          .join(', ');
        finalContent = `[Attached images: ${imageNames}]\n\n${content}`;
      }

      // ═══════════════════════════════════════════════════════════════
      // PIPELINE: Avallac'h (Pre) → Ollama → Vilgefortz (Post)
      // ZAWSZE aktywny - dane zbierane do treningu AI
      // ═══════════════════════════════════════════════════════════════

      if (isTauri()) {
        // Tauri mode: use IPC with full pipeline
        await processPrompt(finalContent, async (enrichedPrompt) => {
          chatMessages.push({ role: 'user', content: enrichedPrompt });
          await invoke('ollama_chat', {
            model: selectedModel,
            messages: chatMessages,
          });
          return '';
        });
      } else {
        // Browser mode: use fetch streaming via proxy
        chatMessages.push({ role: 'user', content: finalContent });

        for await (const chunk of browserOllamaApi.streamChat(selectedModel, chatMessages)) {
          responseBufferRef.current += chunk.token;

          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.streaming) {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMsg,
                  content: lastMsg.content + chunk.token,
                  streaming: !chunk.done,
                },
              ];
            }
            return prev;
          });

          if (chunk.done) {
            setIsLoading(false);
            responseBufferRef.current = '';
          }
        }
      }

    } catch (e) {
      console.error('Chat error:', e);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last.streaming) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              content: `Error: ${e}`,
              streaming: false,
            },
          ];
        }
        return prev;
      });
      setIsLoading(false);
    }
  };

  // Clear chat
  const clearChat = () => {
    setMessages([]);
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Bot className="text-cyan-400" size={24} />
          <div>
            <h2 className="text-lg font-semibold text-matrix-accent">Ollama Chat</h2>
            <p className="text-xs text-matrix-text-dim">
              {ollamaConnected ? `${models.length} models available` : 'Offline'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Alzur Status Indicator */}
          <div
            className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
              alzurStatus.isTraining
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400'
                : alzurStatus.modelVersion > 0
                ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                : 'bg-matrix-bg-secondary border border-matrix-accent/30 text-matrix-text-dim'
            }`}
            title={`Alzur: ${alzurStatus.samples} samples | Buffer: ${alzurStatus.buffer}/10 | Model: v${alzurStatus.modelVersion}`}
          >
            <span className={`w-2 h-2 rounded-full ${
              alzurStatus.isTraining ? 'bg-amber-400 animate-pulse' : 'bg-green-400'
            }`} />
            <span>⚗️ {alzurStatus.isTraining ? 'Training...' : `v${alzurStatus.modelVersion}`}</span>
            <span className="text-[10px] opacity-70">{alzurStatus.buffer}/10</span>
          </div>

          {/* Model selector */}
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={!ollamaConnected || models.length === 0}
            className="glass-panel px-3 py-1.5 text-sm bg-matrix-bg-primary border-matrix-accent/30 focus:border-matrix-accent outline-none rounded"
          >
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>

          <button
            onClick={clearChat}
            className="glass-button text-sm px-3 py-1.5"
            title="Clear chat"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Chat area */}
      <div
        ref={chatContainerRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex-1 glass-panel p-4 overflow-y-auto relative transition-all ${
          isDragging ? 'border-2 border-dashed border-matrix-accent bg-matrix-accent/5' : ''
        }`}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-matrix-bg-primary/80 z-10">
            <div className="text-center">
              <Paperclip size={48} className="mx-auto text-matrix-accent mb-2" />
              <p className="text-matrix-accent">Drop files here</p>
              <p className="text-xs text-matrix-text-dim">Images, code files, text files</p>
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-matrix-text-dim">
            <div className="text-center">
              <Bot size={64} className="mx-auto mb-4 opacity-30 text-cyan-400" />
              <p className="text-lg mb-2">Start chatting with Ollama</p>
              <p className="text-sm">Select a model and type a message</p>
              <p className="text-xs mt-4 opacity-70">
                Drag & drop files to include context
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] ${
                    msg.role === 'user'
                      ? 'bg-matrix-accent/15 border border-matrix-accent/30'
                      : 'bg-matrix-bg-secondary border border-cyan-500/20'
                  } rounded-lg p-3`}
                >
                  {/* Message header */}
                  <div className="flex items-center gap-2 mb-2">
                    {msg.role === 'user' ? (
                      <User size={14} className="text-matrix-accent" />
                    ) : (
                      <Bot size={14} className="text-cyan-400" />
                    )}
                    <span className={`text-xs font-semibold ${
                      msg.role === 'user' ? 'text-matrix-accent' : 'text-cyan-400'
                    }`}>
                      {msg.role === 'user' ? 'You' : msg.model || 'Assistant'}
                    </span>
                    <span className="text-[10px] text-matrix-text-dim">
                      {msg.timestamp.toLocaleTimeString('pl-PL')}
                    </span>
                    {msg.streaming && (
                      <Loader2 size={12} className="animate-spin text-cyan-400" />
                    )}
                  </div>

                  {/* Attachments preview */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center gap-1 px-2 py-1 bg-matrix-bg-primary/50 rounded text-xs"
                        >
                          {att.type === 'image' ? (
                            <ImageIcon size={12} className="text-purple-400" />
                          ) : (
                            <FileText size={12} className="text-blue-400" />
                          )}
                          <span className="truncate max-w-[100px]">{att.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message content */}
                  <div className="prose prose-invert prose-sm max-w-none text-matrix-text-primary">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        code({ className, children, node }) {
                          const match = /language-(\w+)/.exec(className || '');
                          const isInline = !node?.position ||
                            (node.position.start.line === node.position.end.line && !match);

                          // Get the raw code content
                          const codeContent = String(children).replace(/\n$/, '');

                          if (isInline) {
                            return <InlineCode>{children}</InlineCode>;
                          }

                          // Block code with actions
                          return (
                            <CodeBlock
                              code={codeContent}
                              language={match ? match[1] : undefined}
                              className={className}
                            />
                          );
                        },
                        // Override pre to avoid double wrapping
                        pre({ children }) {
                          return <>{children}</>;
                        },
                        p({ children }) {
                          return <p className="mb-2 last:mb-0">{children}</p>;
                        },
                        ul({ children }) {
                          return <ul className="list-disc list-inside mb-2">{children}</ul>;
                        },
                        ol({ children }) {
                          return <ol className="list-decimal list-inside mb-2">{children}</ol>;
                        },
                      }}
                    >
                      {msg.content || (msg.streaming ? '▌' : '')}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 py-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 px-3 py-2 bg-matrix-bg-secondary border border-matrix-accent/30 rounded-lg"
            >
              {att.type === 'image' ? (
                <div className="w-8 h-8 rounded overflow-hidden">
                  <img src={att.content} alt={att.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <FileText size={16} className="text-blue-400" />
              )}
              <span className="text-sm truncate max-w-[150px]">{att.name}</span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="text-matrix-text-dim hover:text-matrix-error"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="mt-3 flex gap-2">
        {/* File input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          multiple
          accept="image/*,.txt,.md,.json,.js,.ts,.py,.rs,.go,.java,.cpp,.c,.h,.css,.html,.xml,.yaml,.yml"
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="glass-button px-3"
          title="Attach file"
        >
          <Paperclip size={18} />
        </button>

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={ollamaConnected ? "Type a message... (Shift+Enter for newline)" : "Ollama is offline"}
            disabled={!ollamaConnected || isLoading}
            rows={1}
            className="w-full glass-panel px-4 py-3 pr-12 resize-none focus:border-matrix-accent outline-none"
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />
        </div>

        {/* Send button */}
        <button
          onClick={sendMessage}
          disabled={(!input.trim() && attachments.length === 0) || !selectedModel || isLoading || !ollamaConnected}
          className="glass-button glass-button-primary px-4"
        >
          {isLoading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>
    </div>
  );
}
