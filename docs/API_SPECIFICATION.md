# HYDRA Multi-CLI API Specification

> Version: 1.1.0 | Last Updated: 2026-01-19

This document provides comprehensive API documentation for all AI providers integrated with HYDRA Multi-CLI Dashboard. It covers message formats, streaming protocols, error handling, rate limits, and practical examples.

---

## Table of Contents

1. [Overview](#overview)
2. [Message Formats](#message-formats)
   - [Claude (Anthropic)](#claude-anthropic-messages-api)
   - [Gemini (Google)](#gemini-google-generativeai)
   - [Jules (Google)](#jules-google-async-tasks)
   - [Codex (OpenAI)](#codex-openai-chat-completions)
   - [Grok (xAI)](#grok-xai-api)
   - [Ollama (Local)](#ollama-local-api)
3. [Streaming Protocols](#streaming-protocols)
   - [Server-Sent Events (SSE)](#server-sent-events-sse)
   - [WebSocket Messages](#websocket-messages)
   - [HTTP Chunked Transfer](#http-chunked-transfer)
   - [Async Polling](#async-polling-for-background-tasks)
4. [CLI Handlers](#cli-handlers)
5. [Error Codes](#error-codes-and-handling)
6. [Rate Limits](#rate-limits-and-best-practices)
7. [Examples](#complete-examples)

---

## Overview

### Provider Matrix

| Provider | Base URL | Auth Method | Streaming | Async |
|----------|----------|-------------|-----------|-------|
| Anthropic (Claude) | `https://api.anthropic.com/v1` | API Key Header | SSE | No |
| Google (Gemini) | `https://generativelanguage.googleapis.com/v1beta` | API Key Query | SSE | No |
| Google (Jules) | `https://jules.google/api/v1` | OAuth 2.0 | Polling | Yes |
| OpenAI (Codex) | `https://api.openai.com/v1` | Bearer Token | SSE | No |
| xAI (Grok) | `https://api.x.ai/v1` | Bearer Token | SSE | No |
| Ollama (Local) | `http://localhost:11434` | None | Chunked | No |

### Common Headers

```http
Content-Type: application/json
Accept: application/json
User-Agent: HYDRA/10.6.1
X-Correlation-ID: hydra-{timestamp}-{random}
```

---

## Message Formats

### Claude (Anthropic Messages API)

**Endpoint:** `POST /v1/messages`

**Authentication:**
```http
x-api-key: {ANTHROPIC_API_KEY}
anthropic-version: 2023-06-01
```

#### Request Format

```json
{
  "model": "claude-opus-4-5-20251101",
  "max_tokens": 8192,
  "system": "You are a helpful AI assistant.",
  "messages": [
    {
      "role": "user",
      "content": "Explain quantum computing"
    },
    {
      "role": "assistant",
      "content": "Quantum computing is..."
    },
    {
      "role": "user",
      "content": "What are qubits?"
    }
  ],
  "temperature": 0.7,
  "top_p": 0.9,
  "top_k": 40,
  "stream": false,
  "stop_sequences": ["\n\nHuman:"],
  "metadata": {
    "user_id": "hydra-user-123"
  }
}
```

#### Response Format (Non-Streaming)

```json
{
  "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Qubits, or quantum bits, are the fundamental unit of quantum information..."
    }
  ],
  "model": "claude-opus-4-5-20251101",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 25,
    "output_tokens": 150
  }
}
```

#### Streaming Response Format (SSE)

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_01XFD...","type":"message","role":"assistant","content":[],"model":"claude-opus-4-5-20251101","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":25,"output_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Qubits"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":", or quantum bits"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":150}}

event: message_stop
data: {"type":"message_stop"}
```

#### Multi-Modal Request (Vision)

```json
{
  "model": "claude-opus-4-5-20251101",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": "iVBORw0KGgo..."
          }
        },
        {
          "type": "text",
          "text": "What's in this image?"
        }
      ]
    }
  ]
}
```

---

### Gemini (Google GenerativeAI)

**Endpoint:** `POST /v1beta/models/{model}:generateContent`

**Authentication:**
```http
?key={GEMINI_API_KEY}
```

#### Request Format

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "Explain machine learning" }
      ]
    }
  ],
  "systemInstruction": {
    "parts": [
      { "text": "You are an expert AI researcher." }
    ]
  },
  "generationConfig": {
    "temperature": 0.7,
    "topP": 0.95,
    "topK": 40,
    "maxOutputTokens": 8192,
    "candidateCount": 1,
    "stopSequences": ["END"]
  },
  "safetySettings": [
    {
      "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
      "threshold": "BLOCK_MEDIUM_AND_ABOVE"
    }
  ]
}
```

#### Response Format (Non-Streaming)

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "Machine learning is a subset of artificial intelligence..."
          }
        ],
        "role": "model"
      },
      "finishReason": "STOP",
      "safetyRatings": [
        {
          "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          "probability": "NEGLIGIBLE"
        }
      ]
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 12,
    "candidatesTokenCount": 245,
    "totalTokenCount": 257
  },
  "modelVersion": "gemini-2.0-flash"
}
```

#### Streaming Endpoint

`POST /v1beta/models/{model}:streamGenerateContent?key={API_KEY}&alt=sse`

#### Gemini Stream Tools (gemini-handler.js)

| Tool | Description |
|------|-------------|
| `gemini_stream` | Stream text generation with real-time chunks |
| `gemini_generate` | Generate text with Gemini models |
| `gemini_chat` | Multi-turn chat conversations |
| `gemini_analyze` | Analyze code, documents, or images |
| `gemini_summarize` | Summarize long content (2M context) |

---

### Jules (Google Async Tasks)

**Endpoint:** `POST /api/v1/tasks`

**Authentication:**
```http
Authorization: Bearer {GOOGLE_OAUTH_TOKEN}
```

#### Task Submission Request

```json
{
  "description": "Generate unit tests for the authentication module",
  "type": "test-generation",
  "priority": 2,
  "repo": "owner/repo-name",
  "branch": "feature/auth-tests",
  "metadata": {
    "targetFiles": ["src/auth/*.js"],
    "testFramework": "jest",
    "coverage": 80
  },
  "estimatedDuration": 300000,
  "webhook": "https://your-server.com/webhooks/jules"
}
```

#### Task Status Response

```json
{
  "id": "jules-1737312000000-a1b2c3d4",
  "description": "Generate unit tests for the authentication module",
  "status": "running",
  "progress": 60,
  "type": "test-generation",
  "priority": 2,
  "result": null,
  "error": null,
  "logs": [
    { "time": 1737312001000, "message": "Task started" },
    { "time": 1737312005000, "message": "Processing step 1/5..." }
  ],
  "createdAt": "2026-01-19T12:00:00.000Z",
  "startedAt": "2026-01-19T12:00:01.000Z",
  "completedAt": null
}
```

#### Jules Tools (jules-handler.js)

| Tool | Description |
|------|-------------|
| `jules_delegate` | Delegate async task to Jules |
| `jules_status` | Check task status |
| `jules_cancel` | Cancel running task |
| `jules_list` | List all tasks |
| `jules_pull` | Pull completed task results |

---

### Codex (OpenAI Chat Completions)

**Endpoint:** `POST /v1/chat/completions`

**Authentication:**
```http
Authorization: Bearer {OPENAI_API_KEY}
```

#### Request Format

```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "You are an expert programmer."
    },
    {
      "role": "user",
      "content": "Write a function to sort an array"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 4096,
  "stream": false
}
```

#### Codex Stream Tools (codex-handler.js)

| Tool | Description |
|------|-------------|
| `codex_stream` | Stream code generation with real-time output |
| `codex_stream_code` | Stream code with syntax validation |
| `codex_stream_review` | Stream code review results |
| `codex_generate` | Generate text with GPT models |
| `codex_code` | Generate code with self-correction |
| `codex_review` | Comprehensive code review |
| `codex_test` | Generate unit tests |
| `codex_debug` | Analyze and fix bugs |

---

### Grok (xAI API)

**Endpoint:** `POST /v1/chat/completions`

**Authentication:**
```http
Authorization: Bearer {XAI_API_KEY}
```

#### Request Format

```json
{
  "model": "grok-3",
  "messages": [
    {
      "role": "system",
      "content": "You are Grok, an AI with real-time information access."
    },
    {
      "role": "user",
      "content": "What's trending on X right now?"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 4096,
  "stream": false
}
```

#### Grok WebSocket Tools (grok-handler.js)

| Tool | Description |
|------|-------------|
| `grok_ws_connect` | Connect to Grok WebSocket for real-time |
| `grok_ws_subscribe` | Subscribe to trending topics |
| `grok_ws_query` | Send query over WebSocket |
| `grok_ws_close` | Close WebSocket connection |
| `grok_generate` | Generate text with Grok models |
| `grok_realtime` | Query real-time information |
| `grok_chat` | Multi-turn chat conversations |

---

### Ollama (Local API)

**Endpoint:** `POST /api/generate`

**Authentication:** None required (local server)

#### Generate Request

```json
{
  "model": "llama3.2:3b",
  "prompt": "Explain recursion in programming",
  "stream": false,
  "options": {
    "temperature": 0.3,
    "num_predict": 2048
  }
}
```

#### Ollama Control Tools

| Tool | Description |
|------|-------------|
| `ollama_generate` | Generate with local models |
| `ollama_smart` | Smart model selection |
| `ollama_status` | Check Ollama server status |
| `ollama_start` | Start Ollama server |
| `ollama_stop` | Stop Ollama server |
| `ollama_restart` | Restart Ollama server |
| `ollama_pull` | Download new model |
| `ollama_list` | List available models |

---

## CLI Handlers

Each provider has a dedicated handler for processing requests:

### gemini-handler.js

```javascript
// Location: GeminiCLI/src/gemini-handler.js
export class GeminiHandler {
  async stream(prompt, options) { /* SSE streaming */ }
  async generate(prompt, options) { /* Non-streaming */ }
  async chat(messages, options) { /* Multi-turn */ }
}
```

### grok-handler.js

```javascript
// Location: GrokCLI/src/grok-handler.js
export class GrokHandler {
  async connectWebSocket() { /* WebSocket connection */ }
  async subscribeTopics(topics) { /* Real-time subscription */ }
  async generate(prompt, options) { /* Text generation */ }
}
```

### codex-handler.js

```javascript
// Location: CodexCLI/src/codex-handler.js
export class CodexHandler {
  async streamCode(prompt, options) { /* Code streaming */ }
  async selfCorrect(prompt, maxAttempts) { /* Self-correction */ }
  async review(code, language) { /* Code review */ }
}
```

### jules-handler.js

```javascript
// Location: JulesCLI/src/jules-handler.js
export class JulesHandler {
  async delegate(task, options) { /* Task delegation */ }
  async pollStatus(taskId) { /* Status polling */ }
  async pullResults(taskId) { /* Get completed results */ }
}
```

---

## Streaming Protocols

### Server-Sent Events (SSE)

Used by: **Claude, Gemini, OpenAI, Grok**

```javascript
async function streamSSE(url, body, onChunk, onComplete) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify(body)
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          onComplete();
          return;
        }
        onChunk(JSON.parse(data));
      }
    }
  }
}
```

### WebSocket Messages

Used for: **Grok real-time features**

```javascript
const ws = new WebSocket('wss://api.x.ai/v1/realtime');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'Bearer {XAI_API_KEY}'
  }));
};

// Subscribe to topics
ws.send(JSON.stringify({
  type: 'subscribe',
  channels: ['trending', 'mentions']
}));
```

### HTTP Chunked Transfer (NDJSON)

Used by: **Ollama**

```javascript
async function streamNDJSON(url, body, onChunk) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value).split('\n');
    for (const line of lines) {
      if (line.trim()) {
        const data = JSON.parse(line);
        onChunk(data);
        if (data.done) return;
      }
    }
  }
}
```

### Async Polling (For Background Tasks)

Used by: **Jules**

```javascript
async function pollTaskStatus(taskId, options = {}) {
  const { interval = 2000, maxAttempts = 150 } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const task = await fetch(`/api/v1/tasks/${taskId}`).then(r => r.json());

    if (['completed', 'failed', 'cancelled'].includes(task.status)) {
      return task;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Polling timeout');
}
```

---

## Error Codes and Handling

### HTTP Status Codes

| Code | Meaning | Retry | Action |
|------|---------|-------|--------|
| 200 | Success | N/A | Process response |
| 400 | Bad Request | No | Fix request format |
| 401 | Unauthorized | No | Check API key |
| 403 | Forbidden | No | Check permissions |
| 429 | Rate Limited | Yes | Wait for Retry-After |
| 500 | Server Error | Yes | Retry with backoff |
| 503 | Service Unavailable | Yes | Retry with backoff |

### Provider-Specific Errors

#### Anthropic (Claude)

```json
{
  "type": "error",
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit exceeded"
  }
}
```

#### Google (Gemini)

```json
{
  "error": {
    "code": 429,
    "message": "Quota exceeded",
    "status": "RESOURCE_EXHAUSTED"
  }
}
```

#### OpenAI (Codex)

```json
{
  "error": {
    "message": "Rate limit exceeded",
    "type": "rate_limit_exceeded",
    "code": "rate_limit_exceeded"
  }
}
```

---

## Rate Limits and Best Practices

### Rate Limits by Provider

| Provider | Tier | RPM | TPM |
|----------|------|-----|-----|
| **Anthropic** | Build | 1,000 | 80K |
| **Google** | Pay-as-you-go | 1,000 | 4M |
| **OpenAI** | Tier 1 | 500 | 30K |
| **xAI** | Standard | 60 | 100K |
| **Ollama** | Local | Unlimited | Unlimited |

### Best Practices

1. **Use streaming for long responses** - Better UX, lower timeout risk
2. **Implement retry with exponential backoff** - Handle transient failures
3. **Cache responses** - Reduce API calls for repeated queries
4. **Use local Ollama for development** - $0 cost, unlimited requests
5. **Route by task type** - Use Witcher Mode routing matrix

---

## Complete Examples

### Multi-Provider Generation

```javascript
import { GeminiHandler } from './gemini-handler.js';
import { CodexHandler } from './codex-handler.js';
import { GrokHandler } from './grok-handler.js';

async function generateResponse(prompt, options = {}) {
  const { provider = 'auto' } = options;

  // Auto-select based on context length
  const tokenEstimate = Math.ceil(prompt.length / 4);
  const selectedProvider = provider === 'auto'
    ? tokenEstimate > 100000 ? 'gemini' : 'codex'
    : provider;

  switch (selectedProvider) {
    case 'gemini':
      return new GeminiHandler().stream(prompt, options);
    case 'codex':
      return new CodexHandler().generate(prompt, options);
    case 'grok':
      return new GrokHandler().generate(prompt, options);
    default:
      throw new Error(`Unknown provider: ${selectedProvider}`);
  }
}
```

### Health Check All Providers

```javascript
async function checkAllProviders() {
  const checks = await Promise.allSettled([
    checkAnthropic(),
    checkGemini(),
    checkOpenAI(),
    checkGrok(),
    checkOllama()
  ]);

  return {
    claude: formatHealthResult(checks[0]),
    gemini: formatHealthResult(checks[1]),
    codex: formatHealthResult(checks[2]),
    grok: formatHealthResult(checks[3]),
    ollama: formatHealthResult(checks[4])
  };
}
```

---

## Appendix: Environment Variables

```bash
# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Google (Gemini)
GEMINI_API_KEY=AIzaSy...
GOOGLE_API_KEY=AIzaSy...

# Google (Jules) - OAuth
GOOGLE_OAUTH_TOKEN=ya29...

# OpenAI (Codex)
OPENAI_API_KEY=sk-proj-...

# xAI (Grok)
XAI_API_KEY=xai-...

# Ollama (Local)
OLLAMA_HOST=http://localhost:11434

# General
DEFAULT_MODEL=llama3.2:3b
CACHE_ENABLED=true
LOG_LEVEL=info
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-01-19 | Removed DeepSeek, added CLI handlers, new streaming tools |
| 1.0.0 | 2026-01-19 | Initial API specification |

---

*Generated by HYDRA Documentation Agent*
