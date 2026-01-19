// ============================================================================
// STREAMING PROVIDERS
// Real-time response streaming for all AI providers
// ============================================================================

import { CLIProvider } from './index';

export interface StreamChunk {
  content: string;
  done: boolean;
  provider: CLIProvider;
  timestamp: number;
}

export type StreamCallback = (chunk: StreamChunk) => void;

// ============================================================================
// OLLAMA STREAMING (Native support)
// ============================================================================

export async function streamOllama(
  prompt: string,
  onChunk: StreamCallback,
  model = 'llama3.2:3b',
  baseUrl = 'http://localhost:11434'
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      onChunk({ content: '', done: true, provider: 'ollama', timestamp: Date.now() });
      break;
    }

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.response) {
          onChunk({
            content: data.response,
            done: data.done || false,
            provider: 'ollama',
            timestamp: Date.now(),
          });
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  }
}

// ============================================================================
// CLAUDE CLI STREAMING (via PTY simulation)
// ============================================================================

export async function streamClaude(
  prompt: string,
  onChunk: StreamCallback,
  _hydraPath?: string
): Promise<void> {
  // For Claude CLI, we need to use a different approach since it doesn't have
  // native streaming API. We'll use a polling approach with the backend.

  // For now, we simulate streaming by breaking up the response
  // In a real implementation, this would use PTY or websocket

  const { safeInvoke, isTauri } = await import('../hooks/useTauri');

  if (!isTauri()) {
    // Browser mode - simulate streaming
    await simulateStreaming(prompt, onChunk, 'hydra');
    return;
  }

  try {
    // Start streaming session
    const sessionId = await safeInvoke<string>('start_streaming_session', {
      provider: 'hydra',
      prompt,
    });

    // Poll for chunks
    let done = false;
    while (!done) {
      const chunk = await safeInvoke<{ content: string; done: boolean } | null>('get_stream_chunk', {
        sessionId,
      });

      if (chunk) {
        onChunk({
          content: chunk.content,
          done: chunk.done,
          provider: 'hydra',
          timestamp: Date.now(),
        });
        done = chunk.done;
      }

      if (!done) {
        await new Promise(r => setTimeout(r, 100)); // 100ms poll interval
      }
    }
  } catch (error) {
    // Fallback to non-streaming
    const response = await safeInvoke<string>('send_to_claude', { message: prompt });
    onChunk({
      content: response,
      done: true,
      provider: 'hydra',
      timestamp: Date.now(),
    });
  }
}

// ============================================================================
// GEMINI STREAMING
// ============================================================================

export async function streamGemini(
  prompt: string,
  onChunk: StreamCallback
): Promise<void> {
  // Gemini CLI might support streaming in the future
  // For now, simulate it
  await simulateStreaming(prompt, onChunk, 'gemini');
}

// ============================================================================
// DEEPSEEK STREAMING (API supports it)
// ============================================================================

export async function streamDeepSeek(
  prompt: string,
  onChunk: StreamCallback,
  apiKey?: string
): Promise<void> {
  if (!apiKey) {
    await simulateStreaming(prompt, onChunk, 'deepseek');
    return;
  }

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      onChunk({ content: '', done: true, provider: 'deepseek', timestamp: Date.now() });
      break;
    }

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(line => line.startsWith('data:'));

    for (const line of lines) {
      const data = line.slice(5).trim();
      if (data === '[DONE]') {
        onChunk({ content: '', done: true, provider: 'deepseek', timestamp: Date.now() });
        return;
      }

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          onChunk({
            content,
            done: false,
            provider: 'deepseek',
            timestamp: Date.now(),
          });
        }
      } catch {
        // Skip invalid JSON
      }
    }
  }
}

// ============================================================================
// STREAMING SIMULATION
// For providers without native streaming support
// ============================================================================

async function simulateStreaming(
  prompt: string,
  onChunk: StreamCallback,
  provider: CLIProvider
): Promise<void> {
  // Generate mock response
  const mockResponses: Record<CLIProvider, string> = {
    hydra: `⚔ Przetwarzam polecenie...\n\nAnalizuję: "${prompt.slice(0, 50)}..."\n\n✅ Zadanie wykonane!`,
    gemini: `🔵 Gemini analizuje z 2M kontekstem...\n\nZapytanie: "${prompt.slice(0, 50)}..."\n\nOdpowiedź generowana...`,
    deepseek: `🔴 DeepSeek-R1 processing...\n\nInput: "${prompt.slice(0, 50)}..."\n\nGenerating response...`,
    jules: `🟣 Jules queuing task...\n\nTask: "${prompt.slice(0, 50)}..."\n\nBackground processing...`,
    codex: `🟢 Codex generating code...\n\n// Task: ${prompt.slice(0, 30)}...`,
    grok: `⚫ Grok responding...\n\n"${prompt.slice(0, 50)}..."`,
    ollama: `🦙 Local model processing...\n\nPrompt: "${prompt.slice(0, 50)}..."`,
  };

  const fullResponse = mockResponses[provider] || `Processing: ${prompt}`;
  const words = fullResponse.split(' ');

  for (let i = 0; i < words.length; i++) {
    const isLast = i === words.length - 1;

    // Add delay to simulate streaming (30-100ms per word)
    await new Promise(r => setTimeout(r, 30 + Math.random() * 70));

    onChunk({
      content: words[i] + (isLast ? '' : ' '),
      done: isLast,
      provider,
      timestamp: Date.now(),
    });
  }
}

// ============================================================================
// UNIFIED STREAMING INTERFACE
// ============================================================================

export async function streamProvider(
  provider: CLIProvider,
  prompt: string,
  onChunk: StreamCallback,
  options?: {
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  }
): Promise<void> {
  switch (provider) {
    case 'ollama':
      return streamOllama(prompt, onChunk, options?.model, options?.baseUrl);

    case 'hydra':
      return streamClaude(prompt, onChunk);

    case 'gemini':
      return streamGemini(prompt, onChunk);

    case 'deepseek':
      return streamDeepSeek(prompt, onChunk, options?.apiKey);

    default:
      return simulateStreaming(prompt, onChunk, provider);
  }
}

// ============================================================================
// STREAMING HOOK
// ============================================================================

export interface StreamingState {
  content: string;
  isStreaming: boolean;
  error: string | null;
  provider: CLIProvider | null;
}

export function createStreamingController() {
  let abortController: AbortController | null = null;
  let currentState: StreamingState = {
    content: '',
    isStreaming: false,
    error: null,
    provider: null,
  };

  return {
    async start(
      provider: CLIProvider,
      prompt: string,
      onUpdate: (state: StreamingState) => void,
      options?: { model?: string; apiKey?: string; baseUrl?: string }
    ) {
      // Abort any existing stream
      if (abortController) {
        abortController.abort();
      }

      abortController = new AbortController();
      currentState = {
        content: '',
        isStreaming: true,
        error: null,
        provider,
      };
      onUpdate(currentState);

      try {
        await streamProvider(provider, prompt, (chunk) => {
          if (abortController?.signal.aborted) return;

          currentState = {
            ...currentState,
            content: currentState.content + chunk.content,
            isStreaming: !chunk.done,
          };
          onUpdate(currentState);
        }, options);
      } catch (error) {
        currentState = {
          ...currentState,
          isStreaming: false,
          error: String(error),
        };
        onUpdate(currentState);
      }
    },

    stop() {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      currentState = {
        ...currentState,
        isStreaming: false,
      };
    },

    getState() {
      return currentState;
    },
  };
}
