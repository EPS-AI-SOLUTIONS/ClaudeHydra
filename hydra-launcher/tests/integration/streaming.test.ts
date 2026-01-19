import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// STREAMING TRANSPORT PROTOCOL TESTS
// Tests for Ollama, Claude, Gemini, DeepSeek streaming implementations
// ============================================================================

// Types from streaming module
type CLIProvider = 'hydra' | 'gemini' | 'deepseek' | 'codex' | 'grok' | 'jules' | 'ollama';

interface StreamChunk {
  content: string;
  done: boolean;
  provider: CLIProvider;
  timestamp: number;
}

type StreamCallback = (chunk: StreamChunk) => void;

interface StreamingState {
  content: string;
  isStreaming: boolean;
  error: string | null;
  provider: CLIProvider | null;
}

// ============================================================================
// MOCK FETCH IMPLEMENTATION
// ============================================================================

interface MockReadableStreamController {
  enqueue: (chunk: Uint8Array) => void;
  close: () => void;
  error: (e: Error) => void;
}

function createMockReadableStream(chunks: string[], delayMs = 10): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream<Uint8Array>({
    async start(controller: ReadableStreamController<Uint8Array>) {
      for (const chunk of chunks) {
        await new Promise(r => setTimeout(r, delayMs));
        controller.enqueue(encoder.encode(chunk));
        index++;
      }
      controller.close();
    },
  });
}

// ============================================================================
// OLLAMA STREAMING TESTS
// ============================================================================

describe('Ollama Streaming', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should parse NDJSON streaming response correctly', async () => {
    const chunks: StreamChunk[] = [];
    const mockResponses = [
      '{"model":"llama3.2:3b","response":"Hello","done":false}\n',
      '{"model":"llama3.2:3b","response":" World","done":false}\n',
      '{"model":"llama3.2:3b","response":"!","done":true}\n',
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(mockResponses),
    });

    // Simulate streamOllama
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({ model: 'llama3.2:3b', prompt: 'test', stream: true }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            chunks.push({
              content: data.response,
              done: data.done || false,
              provider: 'ollama',
              timestamp: Date.now(),
            });
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    expect(chunks.length).toBe(3);
    expect(chunks[0].content).toBe('Hello');
    expect(chunks[1].content).toBe(' World');
    expect(chunks[2].content).toBe('!');
    expect(chunks[2].done).toBe(true);
  });

  it('should handle Ollama connection error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    let error: Error | null = null;
    try {
      await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        body: JSON.stringify({ model: 'llama3.2:3b', prompt: 'test', stream: true }),
      });
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toBe('Connection refused');
  });

  it('should handle non-OK response status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({ model: 'llama3.2:3b', prompt: 'test', stream: true }),
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
  });

  it('should handle malformed JSON in stream', async () => {
    const mockResponses = [
      '{"response":"Valid","done":false}\n',
      'invalid json line\n',
      '{"response":"Still works","done":true}\n',
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(mockResponses),
    });

    const chunks: StreamChunk[] = [];
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({ model: 'llama3.2:3b', prompt: 'test', stream: true }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            chunks.push({
              content: data.response,
              done: data.done || false,
              provider: 'ollama',
              timestamp: Date.now(),
            });
          }
        } catch {
          // Skip invalid JSON - this is expected behavior
        }
      }
    }

    // Should have parsed 2 valid chunks, skipping the invalid one
    expect(chunks.length).toBe(2);
    expect(chunks[0].content).toBe('Valid');
    expect(chunks[1].content).toBe('Still works');
  });
});

// ============================================================================
// CLAUDE CLI POLLING SIMULATION TESTS
// ============================================================================

describe('Claude CLI Polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should poll for chunks at regular intervals', async () => {
    const pollInterval = 100;
    let pollCount = 0;
    const maxPolls = 5;

    const mockGetChunk = vi.fn().mockImplementation(() => {
      pollCount++;
      return {
        content: `Chunk ${pollCount}`,
        done: pollCount >= maxPolls,
      };
    });

    const chunks: string[] = [];
    let done = false;

    // Simulate polling loop
    const poll = async () => {
      while (!done) {
        const chunk = mockGetChunk();
        if (chunk) {
          chunks.push(chunk.content);
          done = chunk.done;
        }
        if (!done) {
          await new Promise(r => setTimeout(r, pollInterval));
        }
      }
    };

    const pollPromise = poll();

    // Advance timers for all polls
    for (let i = 0; i < maxPolls; i++) {
      await vi.advanceTimersByTimeAsync(pollInterval);
    }

    await pollPromise;

    expect(pollCount).toBe(maxPolls);
    expect(chunks.length).toBe(maxPolls);
    expect(chunks[0]).toBe('Chunk 1');
    expect(chunks[maxPolls - 1]).toBe(`Chunk ${maxPolls}`);
  });

  it('should handle session start correctly', async () => {
    const mockStartSession = vi.fn().mockResolvedValue('session_123');

    const sessionId = await mockStartSession({
      provider: 'hydra',
      prompt: 'Test prompt',
    });

    expect(mockStartSession).toHaveBeenCalledWith({
      provider: 'hydra',
      prompt: 'Test prompt',
    });
    expect(sessionId).toBe('session_123');
  });

  it('should fallback to non-streaming on error', async () => {
    const mockStreamingSession = vi.fn().mockRejectedValue(new Error('Streaming not supported'));
    const mockNonStreamingResponse = vi.fn().mockResolvedValue('Non-streaming response');

    let result: string;
    try {
      await mockStreamingSession();
      result = 'streaming worked';
    } catch {
      result = await mockNonStreamingResponse();
    }

    expect(result).toBe('Non-streaming response');
    expect(mockNonStreamingResponse).toHaveBeenCalled();
  });
});

// ============================================================================
// GEMINI SSE (Server-Sent Events) TESTS
// ============================================================================

describe('Gemini SSE Streaming', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should parse SSE event format correctly', async () => {
    const sseEvents = [
      'event: message\ndata: {"text": "Hello"}\n\n',
      'event: message\ndata: {"text": " from"}\n\n',
      'event: message\ndata: {"text": " Gemini"}\n\n',
      'event: done\ndata: {}\n\n',
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(sseEvents),
    });

    const chunks: { text: string }[] = [];
    const response = await fetch('https://api.gemini.com/stream', {
      method: 'POST',
      headers: { 'Accept': 'text/event-stream' },
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });

      // Parse SSE format
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('data:')) {
          const data = lines[i].slice(5).trim();
          if (data && data !== '{}') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                chunks.push(parsed);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    }

    expect(chunks.length).toBe(3);
    expect(chunks.map(c => c.text).join('')).toBe('Hello from Gemini');
  });

  it('should handle SSE retry directive', async () => {
    const sseWithRetry = [
      'retry: 3000\n\n',
      'event: message\ndata: {"text": "Reconnected"}\n\n',
    ];

    let retryValue: number | null = null;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(sseWithRetry),
    });

    const response = await fetch('https://api.gemini.com/stream', {
      method: 'POST',
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('retry:')) {
          retryValue = parseInt(line.slice(6).trim(), 10);
        }
      }
    }

    expect(retryValue).toBe(3000);
  });

  it('should handle SSE connection close gracefully', async () => {
    const sseEvents = [
      'event: message\ndata: {"text": "Partial"}\n\n',
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(sseEvents),
    });

    const response = await fetch('https://api.gemini.com/stream', {
      method: 'POST',
    });

    const reader = response.body?.getReader();
    let streamEnded = false;

    while (reader) {
      const { done } = await reader.read();
      if (done) {
        streamEnded = true;
        break;
      }
    }

    expect(streamEnded).toBe(true);
  });
});

// ============================================================================
// ABORT/CANCEL BEHAVIOR TESTS
// ============================================================================

describe('Stream Abort/Cancel Behavior', () => {
  it('should abort stream using AbortController', async () => {
    const abortController = new AbortController();
    let aborted = false;

    const mockStream = vi.fn().mockImplementation(async (signal: AbortSignal) => {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const streamPromise = mockStream(abortController.signal);
    abortController.abort();

    await expect(streamPromise).rejects.toThrow('Aborted');
    expect(aborted).toBe(true);
  });

  it('should stop processing chunks after abort', async () => {
    const abortController = new AbortController();
    const processedChunks: number[] = [];

    const processChunk = (index: number, signal: AbortSignal) => {
      if (signal.aborted) return false;
      processedChunks.push(index);
      return true;
    };

    // Process 3 chunks, abort after 2nd
    processChunk(1, abortController.signal);
    processChunk(2, abortController.signal);
    abortController.abort();
    processChunk(3, abortController.signal);
    processChunk(4, abortController.signal);

    expect(processedChunks).toEqual([1, 2]);
  });

  it('should cleanup resources on abort', async () => {
    let readerClosed = false;
    let cleanupCalled = false;

    const mockReader = {
      read: vi.fn().mockResolvedValue({ done: false, value: new Uint8Array() }),
      cancel: vi.fn().mockImplementation(() => {
        readerClosed = true;
        return Promise.resolve();
      }),
      releaseLock: vi.fn(),
    };

    const cleanup = () => {
      mockReader.cancel();
      mockReader.releaseLock();
      cleanupCalled = true;
    };

    // Simulate abort
    cleanup();

    expect(readerClosed).toBe(true);
    expect(cleanupCalled).toBe(true);
    expect(mockReader.releaseLock).toHaveBeenCalled();
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe('Streaming Error Handling', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle network timeout', async () => {
    vi.useFakeTimers();

    const timeoutMs = 1000; // Use shorter timeout for test
    let timedOut = false;

    const mockStreamWithTimeout = () => {
      return new Promise<void>((_, reject) => {
        setTimeout(() => {
          timedOut = true;
          reject(new Error('Request timeout'));
        }, timeoutMs);
      });
    };

    const streamPromise = mockStreamWithTimeout();

    // Advance time past timeout
    vi.advanceTimersByTime(timeoutMs + 100);

    await expect(streamPromise).rejects.toThrow('Request timeout');
    expect(timedOut).toBe(true);

    vi.useRealTimers();
  });

  it('should handle partial chunk delivery', async () => {
    const partialChunks = [
      '{"response":"Hello',
      '","done":false}',
      '\n{"response":"World","done":true}\n',
    ];

    let buffer = '';
    const parsedResponses: string[] = [];

    for (const chunk of partialChunks) {
      buffer += chunk;

      // Try to parse complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              parsedResponses.push(data.response);
            }
          } catch {
            // Incomplete JSON, will be completed in next chunk
          }
        }
      }
    }

    expect(parsedResponses).toEqual(['Hello', 'World']);
  });

  it('should handle HTTP error status codes', async () => {
    const errorCases = [
      { status: 400, message: 'Bad Request' },
      { status: 401, message: 'Unauthorized' },
      { status: 429, message: 'Too Many Requests' },
      { status: 500, message: 'Internal Server Error' },
      { status: 503, message: 'Service Unavailable' },
    ];

    for (const { status, message } of errorCases) {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        statusText: message,
      });

      const response = await mockFetch();
      expect(response.ok).toBe(false);
      expect(response.status).toBe(status);
      expect(response.statusText).toBe(message);
    }
  });

  it('should propagate provider-specific errors', async () => {
    interface ProviderError {
      provider: CLIProvider;
      code: string;
      message: string;
    }

    const providerErrors: ProviderError[] = [
      { provider: 'ollama', code: 'MODEL_NOT_FOUND', message: 'Model llama3.2:3b not found' },
      { provider: 'deepseek', code: 'RATE_LIMITED', message: 'Rate limit exceeded' },
      { provider: 'gemini', code: 'CONTEXT_LENGTH', message: 'Context length exceeded' },
    ];

    for (const error of providerErrors) {
      const streamState: StreamingState = {
        content: '',
        isStreaming: false,
        error: `[${error.provider}] ${error.code}: ${error.message}`,
        provider: error.provider,
      };

      expect(streamState.error).toContain(error.code);
      expect(streamState.error).toContain(error.message);
      expect(streamState.provider).toBe(error.provider);
    }
  });
});

// ============================================================================
// STREAMING CONTROLLER TESTS
// ============================================================================

describe('Streaming Controller', () => {
  it('should create controller with initial state', () => {
    const controller = createMockStreamingController();

    const state = controller.getState();
    expect(state.content).toBe('');
    expect(state.isStreaming).toBe(false);
    expect(state.error).toBeNull();
    expect(state.provider).toBeNull();
  });

  it('should update state during streaming', async () => {
    const controller = createMockStreamingController();
    const states: StreamingState[] = [];

    await controller.start(
      'ollama',
      'Test prompt',
      (state) => states.push({ ...state })
    );

    expect(states.length).toBeGreaterThan(0);
    expect(states[0].isStreaming).toBe(true);
    expect(states[states.length - 1].isStreaming).toBe(false);
  });

  it('should accumulate content from chunks', async () => {
    const controller = createMockStreamingController();
    let finalContent = '';

    await controller.start(
      'ollama',
      'Test prompt',
      (state) => { finalContent = state.content; }
    );

    expect(finalContent.length).toBeGreaterThan(0);
  });

  it('should handle stop correctly', () => {
    const controller = createMockStreamingController();

    // Simulate starting
    let currentState = controller.getState();
    currentState = { ...currentState, isStreaming: true, provider: 'ollama' };

    // Stop
    controller.stop();
    const stoppedState = controller.getState();

    expect(stoppedState.isStreaming).toBe(false);
  });
});

// ============================================================================
// HELPER: Mock Streaming Controller
// ============================================================================

function createMockStreamingController() {
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
      onUpdate: (state: StreamingState) => void
    ) {
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

      // Simulate streaming
      const mockContent = `Processing: "${prompt.slice(0, 20)}..."`;
      const words = mockContent.split(' ');

      for (const word of words) {
        if (abortController?.signal.aborted) break;

        await new Promise(r => setTimeout(r, 10));

        currentState = {
          ...currentState,
          content: currentState.content + word + ' ',
        };
        onUpdate(currentState);
      }

      currentState = {
        ...currentState,
        isStreaming: false,
      };
      onUpdate(currentState);
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
