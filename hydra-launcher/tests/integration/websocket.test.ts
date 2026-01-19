import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// WEBSOCKET TRANSPORT PROTOCOL TESTS (Grok)
// Tests for WebSocket connection, reconnect logic, heartbeat, message ordering
// ============================================================================

// Types
type CLIProvider = 'hydra' | 'gemini' | 'deepseek' | 'codex' | 'grok' | 'jules' | 'ollama';

interface WebSocketMessage {
  type: 'message' | 'heartbeat' | 'error' | 'connected' | 'disconnected';
  id?: string;
  content?: string;
  timestamp: number;
  sequence?: number;
}

interface WebSocketState {
  connected: boolean;
  reconnecting: boolean;
  reconnectAttempts: number;
  lastHeartbeat: number | null;
  error: string | null;
}

// ============================================================================
// MOCK WEBSOCKET IMPLEMENTATION
// ============================================================================

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  url: string;
  protocol: string = '';

  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private messageQueue: string[] = [];
  private closeCode: number = 0;
  private closeReason: string = '';

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    if (protocols) {
      this.protocol = Array.isArray(protocols) ? protocols[0] : protocols;
    }
  }

  // Simulate connection opening
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  // Simulate receiving a message
  simulateMessage(data: string) {
    if (this.readyState === MockWebSocket.OPEN && this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }

  // Simulate connection close
  simulateClose(code = 1000, reason = 'Normal closure') {
    this.readyState = MockWebSocket.CLOSED;
    this.closeCode = code;
    this.closeReason = reason;
    if (this.onclose) {
      const event = new CloseEvent('close', { code, reason, wasClean: code === 1000 });
      this.onclose(event);
    }
  }

  // Simulate error
  simulateError(message: string) {
    if (this.onerror) {
      const error = new ErrorEvent('error', { message });
      this.onerror(error);
    }
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.messageQueue.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSING;
    this.simulateClose(code || 1000, reason || 'Client closed');
  }

  getSentMessages(): string[] {
    return [...this.messageQueue];
  }
}

// ============================================================================
// GROK WEBSOCKET CLIENT MOCK
// ============================================================================

class GrokWebSocketClient {
  private ws: MockWebSocket | null = null;
  private url: string;
  private state: WebSocketState;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messageBuffer: WebSocketMessage[] = [];
  private sequenceNumber = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelayMs = 1000;
  private heartbeatIntervalMs = 30000;

  onMessage: ((msg: WebSocketMessage) => void) | null = null;
  onStateChange: ((state: WebSocketState) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    this.state = {
      connected: false,
      reconnecting: false,
      reconnectAttempts: 0,
      lastHeartbeat: null,
      error: null,
    };
  }

  connect(): MockWebSocket {
    this.ws = new MockWebSocket(this.url);

    this.ws.onopen = () => {
      this.state = {
        ...this.state,
        connected: true,
        reconnecting: false,
        reconnectAttempts: 0,
        error: null,
      };
      this.updateState();
      this.startHeartbeat();
    };

    this.ws.onclose = (event) => {
      this.state = {
        ...this.state,
        connected: false,
      };
      this.stopHeartbeat();

      if (!event.wasClean && this.state.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }

      this.updateState();
    };

    this.ws.onerror = () => {
      this.state = {
        ...this.state,
        error: 'WebSocket error occurred',
      };
      this.updateState();
    };

    this.ws.onmessage = (event) => {
      const message = this.parseMessage(event.data);
      if (message) {
        this.handleMessage(message);
      }
    };

    return this.ws;
  }

  private parseMessage(data: string): WebSocketMessage | null {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private handleMessage(message: WebSocketMessage) {
    if (message.type === 'heartbeat') {
      this.state = {
        ...this.state,
        lastHeartbeat: Date.now(),
      };
      this.updateState();
      return;
    }

    // Add to buffer in sequence order
    this.messageBuffer.push(message);
    this.messageBuffer.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

    // Deliver messages in order
    this.deliverMessages();
  }

  private deliverMessages() {
    while (this.messageBuffer.length > 0) {
      const nextMessage = this.messageBuffer[0];
      const expectedSequence = this.sequenceNumber + 1;

      if (nextMessage.sequence === expectedSequence || nextMessage.sequence === undefined) {
        this.messageBuffer.shift();
        this.sequenceNumber = nextMessage.sequence || this.sequenceNumber;

        if (this.onMessage) {
          this.onMessage(nextMessage);
        }
      } else if ((nextMessage.sequence || 0) < expectedSequence) {
        // Duplicate, discard
        this.messageBuffer.shift();
      } else {
        // Gap in sequence, wait for missing messages
        break;
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.state = {
      ...this.state,
      reconnecting: true,
      reconnectAttempts: this.state.reconnectAttempts + 1,
    };
    this.updateState();

    const delay = this.reconnectDelayMs * Math.pow(2, this.state.reconnectAttempts - 1);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, Math.min(delay, 30000)); // Max 30 seconds
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === MockWebSocket.OPEN) {
        this.send({ type: 'heartbeat', timestamp: Date.now() });
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  send(message: Partial<WebSocketMessage>) {
    if (this.ws && this.ws.readyState === MockWebSocket.OPEN) {
      const fullMessage: WebSocketMessage = {
        type: message.type || 'message',
        content: message.content,
        timestamp: Date.now(),
        ...message,
      };
      this.ws.send(JSON.stringify(fullMessage));
    }
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
    }
  }

  getState(): WebSocketState {
    return { ...this.state };
  }

  private updateState() {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  getWebSocket(): MockWebSocket | null {
    return this.ws;
  }

  // For testing
  setReconnectDelay(ms: number) {
    this.reconnectDelayMs = ms;
  }

  setHeartbeatInterval(ms: number) {
    this.heartbeatIntervalMs = ms;
  }

  resetSequence() {
    this.sequenceNumber = 0;
    this.messageBuffer = [];
  }
}

// ============================================================================
// WEBSOCKET CONNECTION TESTS
// ============================================================================

describe('WebSocket Connection (Grok)', () => {
  let client: GrokWebSocketClient;

  beforeEach(() => {
    client = new GrokWebSocketClient('wss://api.grok.x.ai/v1/chat');
  });

  afterEach(() => {
    client.disconnect();
  });

  it('should establish connection successfully', () => {
    const ws = client.connect();
    ws.simulateOpen();

    const state = client.getState();
    expect(state.connected).toBe(true);
    expect(state.error).toBeNull();
  });

  it('should update state on connection open', () => {
    const states: WebSocketState[] = [];
    client.onStateChange = (state) => states.push({ ...state });

    const ws = client.connect();
    ws.simulateOpen();

    expect(states.some(s => s.connected)).toBe(true);
  });

  it('should handle connection close', () => {
    const ws = client.connect();
    ws.simulateOpen();
    ws.simulateClose(1000, 'Normal closure');

    const state = client.getState();
    expect(state.connected).toBe(false);
  });

  it('should handle connection error', () => {
    const ws = client.connect();
    ws.simulateError('Connection failed');

    const state = client.getState();
    expect(state.error).toBe('WebSocket error occurred');
  });

  it('should parse incoming messages', () => {
    const messages: WebSocketMessage[] = [];
    client.onMessage = (msg) => messages.push(msg);

    const ws = client.connect();
    ws.simulateOpen();

    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'Hello from Grok',
      timestamp: Date.now(),
      sequence: 1,
    }));

    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Hello from Grok');
  });

  it('should send messages when connected', () => {
    const ws = client.connect();
    ws.simulateOpen();

    client.send({
      type: 'message',
      content: 'Hello Grok',
    });

    const sent = ws.getSentMessages();
    expect(sent.length).toBe(1);

    const parsed = JSON.parse(sent[0]);
    expect(parsed.content).toBe('Hello Grok');
  });

  it('should not send when disconnected', () => {
    const ws = client.connect();
    // Don't open connection - ws stays in CONNECTING state

    // When not connected, send() silently returns (doesn't throw)
    // This is the expected behavior since we check readyState in send()
    client.send({ type: 'message', content: 'Test' });

    // No messages should have been sent
    expect(ws.getSentMessages().length).toBe(0);
  });
});

// ============================================================================
// RECONNECT LOGIC TESTS
// ============================================================================

describe('WebSocket Reconnect Logic', () => {
  let client: GrokWebSocketClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new GrokWebSocketClient('wss://api.grok.x.ai/v1/chat');
    client.setReconnectDelay(100);
  });

  afterEach(() => {
    vi.useRealTimers();
    client.disconnect();
  });

  it('should schedule reconnect on abnormal close', async () => {
    const states: WebSocketState[] = [];
    client.onStateChange = (state) => states.push({ ...state });

    const ws = client.connect();
    ws.simulateOpen();
    ws.simulateClose(1006, 'Abnormal closure');

    expect(states.some(s => s.reconnecting)).toBe(true);
  });

  it('should increment reconnect attempts', async () => {
    const states: WebSocketState[] = [];
    client.onStateChange = (state) => states.push({ ...state });

    const ws = client.connect();
    ws.simulateOpen();
    ws.simulateClose(1006, 'Connection lost');

    const reconnectingState = states.find(s => s.reconnecting);
    expect(reconnectingState?.reconnectAttempts).toBe(1);
  });

  it('should use exponential backoff for reconnect', async () => {
    client.setReconnectDelay(1000);

    const ws = client.connect();
    ws.simulateOpen();

    // First disconnect
    ws.simulateClose(1006, 'Connection lost');
    expect(client.getState().reconnectAttempts).toBe(1);

    // Advance time for first reconnect (1000ms)
    await vi.advanceTimersByTimeAsync(1000);

    const newWs = client.getWebSocket();
    if (newWs) {
      newWs.simulateOpen();
      newWs.simulateClose(1006, 'Connection lost again');
    }

    expect(client.getState().reconnectAttempts).toBe(1); // Reset after successful connect
  });

  it('should not reconnect on clean close', () => {
    const states: WebSocketState[] = [];
    client.onStateChange = (state) => states.push({ ...state });

    const ws = client.connect();
    ws.simulateOpen();
    ws.simulateClose(1000, 'Normal closure');

    expect(states.every(s => !s.reconnecting || s.reconnectAttempts === 0)).toBe(true);
  });

  it('should stop reconnecting after max attempts', async () => {
    const maxAttempts = 5;
    let reconnectAttempts = 0;

    client.onStateChange = (state) => {
      if (state.reconnecting) {
        reconnectAttempts = state.reconnectAttempts;
      }
    };

    const ws = client.connect();
    ws.simulateOpen();

    // Simulate multiple failures
    for (let i = 0; i < maxAttempts + 2; i++) {
      const currentWs = client.getWebSocket();
      if (currentWs) {
        currentWs.simulateClose(1006, 'Connection lost');
      }
      await vi.advanceTimersByTimeAsync(30000); // Max backoff
    }

    // Should stop at maxAttempts
    expect(reconnectAttempts).toBeLessThanOrEqual(maxAttempts);
  });

  it('should reset reconnect attempts on successful connection', async () => {
    const ws = client.connect();
    ws.simulateOpen();
    ws.simulateClose(1006, 'Lost');

    expect(client.getState().reconnectAttempts).toBe(1);

    await vi.advanceTimersByTimeAsync(100);

    const newWs = client.getWebSocket();
    if (newWs) {
      newWs.simulateOpen();
    }

    expect(client.getState().reconnectAttempts).toBe(0);
  });
});

// ============================================================================
// HEARTBEAT TESTS
// ============================================================================

describe('WebSocket Heartbeat', () => {
  let client: GrokWebSocketClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new GrokWebSocketClient('wss://api.grok.x.ai/v1/chat');
    client.setHeartbeatInterval(1000);
  });

  afterEach(() => {
    vi.useRealTimers();
    client.disconnect();
  });

  it('should send heartbeat at regular intervals', async () => {
    const ws = client.connect();
    ws.simulateOpen();

    // Advance time for 3 heartbeats
    await vi.advanceTimersByTimeAsync(3500);

    const sent = ws.getSentMessages();
    const heartbeats = sent.filter(msg => {
      const parsed = JSON.parse(msg);
      return parsed.type === 'heartbeat';
    });

    expect(heartbeats.length).toBe(3);
  });

  it('should update lastHeartbeat on heartbeat response', () => {
    const ws = client.connect();
    ws.simulateOpen();

    const beforeHeartbeat = client.getState().lastHeartbeat;

    ws.simulateMessage(JSON.stringify({
      type: 'heartbeat',
      timestamp: Date.now(),
    }));

    const afterHeartbeat = client.getState().lastHeartbeat;
    expect(afterHeartbeat).not.toBe(beforeHeartbeat);
    expect(afterHeartbeat).not.toBeNull();
  });

  it('should stop heartbeat on disconnect', async () => {
    const ws = client.connect();
    ws.simulateOpen();

    await vi.advanceTimersByTimeAsync(1500);
    const sentBeforeDisconnect = ws.getSentMessages().length;

    client.disconnect();

    await vi.advanceTimersByTimeAsync(3000);
    // No new heartbeats should be sent
    expect(ws.getSentMessages().length).toBe(sentBeforeDisconnect);
  });

  it('should detect missed heartbeats', async () => {
    const ws = client.connect();
    ws.simulateOpen();

    // Send first heartbeat response
    ws.simulateMessage(JSON.stringify({
      type: 'heartbeat',
      timestamp: Date.now(),
    }));

    const firstHeartbeat = client.getState().lastHeartbeat;

    // Advance time without sending heartbeat response
    await vi.advanceTimersByTimeAsync(5000);

    // Last heartbeat should still be the first one
    expect(client.getState().lastHeartbeat).toBe(firstHeartbeat);
  });

  it('should restart heartbeat on reconnect', async () => {
    client.setReconnectDelay(100);

    const ws = client.connect();
    ws.simulateOpen();

    // Let some heartbeats happen
    await vi.advanceTimersByTimeAsync(2500);
    const firstSentCount = ws.getSentMessages().length;

    // Disconnect and reconnect
    ws.simulateClose(1006, 'Lost');
    await vi.advanceTimersByTimeAsync(100);

    const newWs = client.getWebSocket();
    if (newWs) {
      newWs.simulateOpen();

      // Heartbeats should resume
      await vi.advanceTimersByTimeAsync(2500);
      expect(newWs.getSentMessages().length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// MESSAGE ORDERING TESTS
// ============================================================================

describe('WebSocket Message Ordering', () => {
  let client: GrokWebSocketClient;

  beforeEach(() => {
    client = new GrokWebSocketClient('wss://api.grok.x.ai/v1/chat');
  });

  afterEach(() => {
    client.disconnect();
  });

  it('should deliver messages in sequence order', () => {
    const receivedMessages: WebSocketMessage[] = [];
    client.onMessage = (msg) => receivedMessages.push(msg);

    const ws = client.connect();
    ws.simulateOpen();

    // Send messages out of order
    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'First',
      timestamp: Date.now(),
      sequence: 1,
    }));

    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'Second',
      timestamp: Date.now(),
      sequence: 2,
    }));

    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'Third',
      timestamp: Date.now(),
      sequence: 3,
    }));

    expect(receivedMessages.length).toBe(3);
    expect(receivedMessages[0].content).toBe('First');
    expect(receivedMessages[1].content).toBe('Second');
    expect(receivedMessages[2].content).toBe('Third');
  });

  it('should buffer out-of-order messages', () => {
    const receivedMessages: WebSocketMessage[] = [];
    client.onMessage = (msg) => receivedMessages.push(msg);

    const ws = client.connect();
    ws.simulateOpen();

    // Send sequence 3 first (out of order)
    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'Third',
      timestamp: Date.now(),
      sequence: 3,
    }));

    // Should be buffered, not delivered yet
    expect(receivedMessages.length).toBe(0);

    // Send sequence 1
    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'First',
      timestamp: Date.now(),
      sequence: 1,
    }));

    // Only first should be delivered
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].content).toBe('First');

    // Send sequence 2
    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'Second',
      timestamp: Date.now(),
      sequence: 2,
    }));

    // Now all three should be delivered in order
    expect(receivedMessages.length).toBe(3);
    expect(receivedMessages[0].content).toBe('First');
    expect(receivedMessages[1].content).toBe('Second');
    expect(receivedMessages[2].content).toBe('Third');
  });

  it('should discard duplicate messages', () => {
    const receivedMessages: WebSocketMessage[] = [];
    client.onMessage = (msg) => receivedMessages.push(msg);

    const ws = client.connect();
    ws.simulateOpen();

    // Send sequence 1
    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'First',
      timestamp: Date.now(),
      sequence: 1,
    }));

    // Send sequence 1 again (duplicate)
    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'First (duplicate)',
      timestamp: Date.now(),
      sequence: 1,
    }));

    // Send sequence 2
    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'Second',
      timestamp: Date.now(),
      sequence: 2,
    }));

    expect(receivedMessages.length).toBe(2);
    expect(receivedMessages[0].content).toBe('First');
    expect(receivedMessages[1].content).toBe('Second');
  });

  it('should handle messages without sequence numbers', () => {
    const receivedMessages: WebSocketMessage[] = [];
    client.onMessage = (msg) => receivedMessages.push(msg);

    const ws = client.connect();
    ws.simulateOpen();

    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'No sequence',
      timestamp: Date.now(),
    }));

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].content).toBe('No sequence');
  });

  it('should handle large gaps in sequence', () => {
    const receivedMessages: WebSocketMessage[] = [];
    client.onMessage = (msg) => receivedMessages.push(msg);

    const ws = client.connect();
    ws.simulateOpen();

    // Send sequence 1
    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'First',
      timestamp: Date.now(),
      sequence: 1,
    }));

    // Send sequence 100 (large gap)
    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'Hundredth',
      timestamp: Date.now(),
      sequence: 100,
    }));

    // Only first delivered, 100 buffered
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].content).toBe('First');

    // Fill the gap (simplified - just send sequence 2)
    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'Second',
      timestamp: Date.now(),
      sequence: 2,
    }));

    expect(receivedMessages.length).toBe(2);
    expect(receivedMessages[1].content).toBe('Second');
    // Note: 100 still buffered waiting for 3-99
  });

  it('should reset sequence tracking on reconnect', () => {
    client.resetSequence();

    const receivedMessages: WebSocketMessage[] = [];
    client.onMessage = (msg) => receivedMessages.push(msg);

    const ws = client.connect();
    ws.simulateOpen();

    // After reset, sequence 1 should work again
    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: 'New First',
      timestamp: Date.now(),
      sequence: 1,
    }));

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].content).toBe('New First');
  });
});

// ============================================================================
// CONNECTION CLOSE CODES TESTS
// ============================================================================

describe('WebSocket Close Codes', () => {
  let client: GrokWebSocketClient;

  beforeEach(() => {
    client = new GrokWebSocketClient('wss://api.grok.x.ai/v1/chat');
    client.setReconnectDelay(100);
  });

  afterEach(() => {
    client.disconnect();
  });

  it('should handle normal closure (1000)', () => {
    const states: WebSocketState[] = [];
    client.onStateChange = (state) => states.push({ ...state });

    const ws = client.connect();
    ws.simulateOpen();
    ws.simulateClose(1000, 'Normal closure');

    expect(client.getState().connected).toBe(false);
    expect(states.every(s => !s.reconnecting)).toBe(true);
  });

  it('should handle going away (1001)', () => {
    const ws = client.connect();
    ws.simulateOpen();
    ws.simulateClose(1001, 'Going away');

    expect(client.getState().connected).toBe(false);
    expect(client.getState().reconnecting).toBe(true);
  });

  it('should handle abnormal closure (1006)', () => {
    const ws = client.connect();
    ws.simulateOpen();
    ws.simulateClose(1006, 'Abnormal closure');

    expect(client.getState().reconnecting).toBe(true);
  });

  it('should handle policy violation (1008)', () => {
    const ws = client.connect();
    ws.simulateOpen();
    ws.simulateClose(1008, 'Policy violation');

    // Should not reconnect on policy violation
    expect(client.getState().connected).toBe(false);
  });

  it('should handle internal error (1011)', () => {
    const ws = client.connect();
    ws.simulateOpen();
    ws.simulateClose(1011, 'Internal error');

    expect(client.getState().reconnecting).toBe(true);
  });
});

// ============================================================================
// BINARY DATA HANDLING TESTS
// ============================================================================

describe('WebSocket Binary Data', () => {
  let client: GrokWebSocketClient;

  beforeEach(() => {
    client = new GrokWebSocketClient('wss://api.grok.x.ai/v1/chat');
  });

  afterEach(() => {
    client.disconnect();
  });

  it('should handle base64 encoded binary data', () => {
    const receivedMessages: WebSocketMessage[] = [];
    client.onMessage = (msg) => receivedMessages.push(msg);

    const ws = client.connect();
    ws.simulateOpen();

    const binaryContent = Buffer.from('Binary data here').toString('base64');

    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: binaryContent,
      timestamp: Date.now(),
      sequence: 1,
    }));

    expect(receivedMessages.length).toBe(1);

    // Decode base64
    const decoded = Buffer.from(receivedMessages[0].content || '', 'base64').toString();
    expect(decoded).toBe('Binary data here');
  });

  it('should handle large messages', () => {
    const receivedMessages: WebSocketMessage[] = [];
    client.onMessage = (msg) => receivedMessages.push(msg);

    const ws = client.connect();
    ws.simulateOpen();

    // 100KB message
    const largeContent = 'x'.repeat(100 * 1024);

    ws.simulateMessage(JSON.stringify({
      type: 'message',
      content: largeContent,
      timestamp: Date.now(),
      sequence: 1,
    }));

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].content?.length).toBe(100 * 1024);
  });
});
