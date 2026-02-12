'use client';

import {
  Bot,
  Cpu,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Send,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { useChatHistory } from '@/hooks/useChatHistory';
import { CodeBlock, InlineCode } from './CodeBlock';

// ── Ollama API via Next.js proxy (rewrites in next.config.ts) ──

const OLLAMA_PROXY = '/api/ollama';

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
  content: string;
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

async function ollamaHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_PROXY}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ollamaListModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_PROXY}/api/tags`);
  if (!res.ok) throw new Error('Failed to fetch models');
  const data = await res.json();
  return data.models || [];
}

async function* ollamaStreamChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
): AsyncGenerator<StreamChunk> {
  const res = await fetch(`${OLLAMA_PROXY}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Chat request failed: ${res.status} ${errorText}`);
  }

  if (!res.body) {
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
      } catch {
        /* ignore parse errors */
      }
    }
  }
}

// ── Component ──

export function OllamaChatView() {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [ollamaConnected, setOllamaConnected] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const responseBufferRef = useRef<string>('');

  const { currentSession, createSession, addMessage: saveChatMessage } = useChatHistory();

  // Load models on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        const isHealthy = await ollamaHealthCheck();
        setOllamaConnected(isHealthy);
        if (isHealthy) {
          const result = await ollamaListModels();
          if (result.length > 0) {
            setModels(result);
          }
        }
      } catch (e) {
        console.error('Failed to load models:', e);
        setOllamaConnected(false);
      }
    };
    loadModels();
  }, []);

  // Auto-select model
  useEffect(() => {
    if (selectedModel || models.length === 0) return;
    setSelectedModel(models[0].name);
  }, [models, selectedModel]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Paste handler
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) await processFile(file);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
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
          content,
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

  // Drag & Drop handlers
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

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (const file of Array.from(files)) {
        await processFile(file);
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Send message with streaming
  const sendMessage = useCallback(async () => {
    if ((!input.trim() && attachments.length === 0) || !selectedModel || isLoading) return;

    let content = input;
    for (const att of attachments) {
      if (att.type === 'file') {
        content += `\n\n--- Plik: ${att.name} ---\n${att.content}`;
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

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    // Placeholder for assistant
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
      const chatMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      chatMessages.push({ role: 'user', content });

      responseBufferRef.current = '';

      for await (const chunk of ollamaStreamChat(selectedModel, chatMessages)) {
        responseBufferRef.current += chunk.token;

        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.streaming) {
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

          // Save assistant response
          if (sessionId) {
            saveChatMessage(sessionId, 'assistant', responseBufferRef.current, selectedModel);
          }
          responseBufferRef.current = '';
        }
      }
    } catch (e) {
      console.error('Chat error:', e);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.streaming) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              content: `Błąd: ${e}`,
              streaming: false,
            },
          ];
        }
        return prev;
      });
      setIsLoading(false);
    }
  }, [
    input,
    attachments,
    selectedModel,
    isLoading,
    messages,
    currentSession,
    createSession,
    saveChatMessage,
  ]);

  const clearChat = () => setMessages([]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Bot className="text-[var(--matrix-text-secondary)]" size={24} />
          <div>
            <h2 className="text-lg font-semibold text-[var(--matrix-accent)]">Ollama Chat</h2>
            <p className="text-xs text-[var(--matrix-text-secondary)]">
              {ollamaConnected ? `${models.length} modeli dostępnych` : 'Offline'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={!ollamaConnected || models.length === 0}
            className="glass-panel px-3 py-1.5 text-sm bg-[var(--matrix-bg-primary)] border-[var(--matrix-accent)]/30 focus:border-[var(--matrix-accent)] outline-none rounded"
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
            title="Wyczyść czat"
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
          isDragging
            ? 'border-2 border-dashed border-[var(--matrix-accent)] bg-[var(--matrix-accent)]/5'
            : ''
        }`}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--matrix-bg-primary)]/80 z-10">
            <div className="text-center">
              <Paperclip size={48} className="mx-auto text-[var(--matrix-accent)] mb-2" />
              <p className="text-[var(--matrix-accent)]">Upuść pliki tutaj</p>
              <p className="text-xs text-[var(--matrix-text-secondary)]">
                Obrazy, pliki kodu, pliki tekstowe
              </p>
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[var(--matrix-text-secondary)]">
            <div className="text-center">
              <Bot size={64} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">Rozpocznij rozmowę z Ollama</p>
              <p className="text-sm">Wybierz model i wpisz wiadomość</p>
              <p className="text-xs mt-4 opacity-70">
                Przeciągnij i upuść pliki, aby dodać kontekst
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
                      ? 'bg-white/10 border border-white/25 backdrop-blur-sm'
                      : 'bg-black/30 border border-white/10 backdrop-blur-sm'
                  } rounded-xl p-3 shadow-lg`}
                >
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2">
                    {msg.role === 'user' ? (
                      <User size={14} className="text-white" />
                    ) : (
                      <Bot size={14} className="text-white/70" />
                    )}
                    <span
                      className={`text-xs font-semibold ${
                        msg.role === 'user' ? 'text-white' : 'text-white/70'
                      }`}
                    >
                      {msg.role === 'user' ? 'Ty' : 'Asystent'}
                    </span>
                    {msg.role !== 'user' && msg.model && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border text-[var(--matrix-accent)] bg-[var(--matrix-accent)]/15 border-[var(--matrix-accent)]/30">
                        <Cpu size={9} />
                        {msg.model}
                      </span>
                    )}
                    <span className="text-[10px] text-[var(--matrix-text-secondary)]">
                      {msg.timestamp.toLocaleTimeString('pl-PL')}
                    </span>
                    {msg.streaming && <Loader2 size={12} className="animate-spin text-white/60" />}
                  </div>

                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center gap-1 px-2 py-1 bg-[var(--matrix-bg-primary)]/50 rounded text-xs"
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

                  {/* Content */}
                  <div className="prose prose-invert prose-sm max-w-none text-[var(--matrix-text-primary)]">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        code({ className, children, node }) {
                          const match = /language-(\w+)/.exec(className || '');
                          const isInline =
                            !node?.position ||
                            (node.position.start.line === node.position.end.line && !match);
                          const codeContent = String(children).replace(/\n$/, '');

                          if (isInline) {
                            return <InlineCode>{children}</InlineCode>;
                          }

                          return (
                            <CodeBlock
                              code={codeContent}
                              language={match ? match[1] : undefined}
                              className={className}
                            />
                          );
                        },
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
              className="flex items-center gap-2 px-3 py-2 bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-accent)]/30 rounded-lg"
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
                className="text-[var(--matrix-text-secondary)] hover:text-red-400"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="mt-3 flex gap-2">
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
          title="Dołącz plik"
        >
          <Paperclip size={18} />
        </button>

        <div className="flex-1 relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={
              ollamaConnected
                ? 'Wpisz wiadomość... (Shift+Enter = nowa linia)'
                : 'Ollama jest offline'
            }
            disabled={!ollamaConnected || isLoading}
            rows={1}
            className="w-full glass-panel px-4 py-3 pr-12 resize-none focus:border-[var(--matrix-accent)] outline-none"
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />
        </div>

        <button
          onClick={sendMessage}
          disabled={
            (!input.trim() && attachments.length === 0) ||
            !selectedModel ||
            isLoading ||
            !ollamaConnected
          }
          className="glass-button glass-button-primary px-4"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
