# GeminiCLI - Google Gemini + Ollama MCP Server

```
+---------------------------------------------------------------------+
|  GEMINI CLI - Google AI + Ollama MCP Server for HYDRA               |
|  ====================================================================
|  Provider: Google (Gemini) + Local (Ollama)                          |
|  Models: Gemini 2.0 Flash/Pro, Llama 3.2, Mistral                    |
|  Features: 2M context, Multimodal, Streaming, Local inference        |
|  Protocol: Model Context Protocol (MCP)                              |
+---------------------------------------------------------------------+
```

## Overview

GeminiCLI is an MCP server that provides integration with Google's Gemini models and local Ollama inference for the HYDRA Multi-CLI Dashboard. It supports:

- Text generation with Gemini 2.0 and Ollama models
- Streaming responses (SSE for Gemini, NDJSON for Ollama)
- 2M token context window (Gemini)
- Multimodal input (images, documents)
- Local inference with Ollama (zero cost)

## Installation

```bash
# Navigate to GeminiCLI directory
cd GeminiCLI

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env and add your API keys
```

## Configuration

### Required

Set your Google API key in `.env`:

```bash
GOOGLE_API_KEY=your_google_api_key_here
# or
GEMINI_API_KEY=your_gemini_api_key_here
```

### Optional Settings

```bash
# Ollama
OLLAMA_HOST=http://localhost:11434
DEFAULT_MODEL=llama3.2:3b
FAST_MODEL=llama3.2:1b
CODER_MODEL=deepseek-coder:6.7b

# Gemini
GEMINI_MODEL=gemini-2.0-flash
GEMINI_PRO_MODEL=gemini-2.0-pro

# Cache
CACHE_ENCRYPTION_KEY=your-32-byte-key
CACHE_TTL=3600

# Safety
HYDRA_YOLO=false
HYDRA_RISK_BLOCKING=true

# Logging
LOG_LEVEL=info
```

## Quick Start

```bash
# Start the MCP server
pnpm start

# Or with launcher (status line, auto-resume, YOLO)
npm run launcher

# Development mode
pnpm dev
```

## Available Tools

### Gemini Tools (gemini-handler.js)

| Tool | Description |
|------|-------------|
| `gemini_stream` | Stream text generation with real-time SSE chunks |
| `gemini_generate` | Generate text with Gemini models |
| `gemini_chat` | Multi-turn chat conversations |
| `gemini_analyze` | Analyze code, documents, or images |
| `gemini_summarize` | Summarize long content (uses 2M context) |
| `gemini_status` | Check Gemini API status |

### Ollama Tools

| Tool | Description |
|------|-------------|
| `ollama_generate` | Generate text with local models |
| `ollama_smart` | Smart model selection based on task |
| `ollama_speculative` | Speculative decoding for faster inference |
| `ollama_status` | Check Ollama server status |
| `ollama_start` | Start Ollama server |
| `ollama_stop` | Stop Ollama server |
| `ollama_restart` | Restart Ollama server |
| `ollama_pull` | Download new model |
| `ollama_list` | List available models |
| `ollama_cache_clear` | Clear response cache |

### HYDRA Tools

| Tool | Description |
|------|-------------|
| `hydra_swarm` | 6-step AgentSwarm with 12 agents |
| `hydra_health` | Health check for all providers |
| `hydra_config` | View/update configuration |

## Handler: gemini-handler.js

The Gemini handler provides streaming and non-streaming generation.

### Usage Examples

```javascript
// Stream generation
const handler = new GeminiHandler({
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-2.0-flash'
});

// With streaming
await handler.stream(prompt, {
  onChunk: (text) => process.stdout.write(text),
  onComplete: (result) => console.log('\nDone:', result.usageMetadata)
});

// Without streaming
const result = await handler.generate(prompt, { temperature: 0.7 });
```

### Streaming Response

```javascript
{
  "tool": "gemini_stream",
  "arguments": {
    "prompt": "Explain quantum computing",
    "model": "gemini-2.0-flash",
    "temperature": 0.7,
    "maxTokens": 4096
  }
}
```

## Integration with HYDRA

GeminiCLI integrates with the HYDRA Multi-CLI Dashboard:

```bash
# Direct Gemini command
/gemini "Analyze this codebase"

# Witcher Mode - Deep analysis
/witcher igni "Deep analysis burn"

# Local AI (Ollama)
/ai "Quick local query - $0 cost"

# Status check
/ai-status
```

## MCP Configuration

Add to your MCP settings (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gemini-hydra": {
      "command": "node",
      "args": ["C:/Users/BIURODOM/Desktop/ClaudeHYDRA/GeminiCLI/src/server.js"],
      "env": {
        "GOOGLE_API_KEY": "your_api_key"
      }
    }
  }
}
```

## Project Structure

```
GeminiCLI/
+-- src/
|   +-- server.js           # MCP server entry point
|   +-- gemini-handler.js   # Gemini streaming handler
|   +-- gemini-models.js    # Model definitions
|   +-- api-client.js       # API client wrapper
|   +-- cache.js            # Response caching
|   +-- lru-cache.js        # LRU cache implementation
|   +-- logger.js           # Logging utility
|   +-- config.js           # Configuration
|   +-- errors.js           # Error handling
|   +-- health.js           # Health checks
|   +-- analytics.js        # Usage analytics
|   +-- planner.js          # Task planning
|   +-- webhooks.js         # Webhook support
|   +-- migrations.js       # Config migrations
+-- test/
|   +-- integration.test.js
|   +-- ollama.test.js
|   +-- swarm.test.js
+-- package.json
+-- .env.example
+-- README.md
```

## Key Features

| Feature | Description |
|---------|-------------|
| 2M Context | Process large documents with Gemini |
| Streaming | Real-time SSE responses |
| Multimodal | Image and document analysis |
| Local Inference | Zero-cost with Ollama |
| Caching | Encrypted response cache |
| Smart Selection | Auto-select best model for task |

## Models

### Gemini Models

| Model | Description | Best For |
|-------|-------------|----------|
| gemini-2.0-flash | Fast, efficient | Quick responses |
| gemini-2.0-pro | Highest quality | Complex analysis |

### Ollama Models

| Model | Description | Best For |
|-------|-------------|----------|
| llama3.2:3b | Fast, general | Quick queries |
| llama3.2:1b | Ultra-fast | Simple tasks |
| deepseek-coder:6.7b | Code-focused | Programming |
| mistral:7b | Balanced | General use |

## Logging

Logs in production are JSON formatted, controlled by `LOG_LEVEL`.
Swarm sessions are archived in `.serena/memories`.

## Documentation

- [Google AI Documentation](https://ai.google.dev/docs)
- [Ollama Documentation](https://ollama.ai/library)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [HYDRA Documentation](../CLAUDE.md)

## License

MIT
