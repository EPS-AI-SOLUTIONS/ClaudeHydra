# Grok CLI - xAI MCP Server for HYDRA

```
+---------------------------------------------------------------------+
|  GROK CLI - xAI Grok MCP Server for HYDRA                           |
|  ====================================================================
|  Provider: xAI                                                       |
|  Model: Grok-3, Grok-3-fast, Grok-2-Vision                          |
|  Features: Real-time data, WebSocket, Code analysis, Creative       |
|  Protocol: Model Context Protocol (MCP)                              |
+---------------------------------------------------------------------+
```

## Overview

GrokCLI is an MCP (Model Context Protocol) server that provides integration with xAI's Grok models for the HYDRA Multi-CLI Dashboard. It supports text generation, chat conversations, real-time information access, WebSocket streaming, and code analysis.

## Installation

```bash
# Navigate to GrokCLI directory
cd GrokCLI

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env and add your xAI API key
```

## Configuration

### Required

Set your xAI API key in `.env`:

```bash
XAI_API_KEY=your_xai_api_key_here
```

Get your API key from [xAI Console](https://console.x.ai)

### Optional Settings

```bash
# Models
GROK_DEFAULT_MODEL=grok-3
GROK_FAST_MODEL=grok-3-fast
GROK_VISION_MODEL=grok-2-vision-1212

# Request settings
GROK_TEMPERATURE=0.7
GROK_MAX_TOKENS=4096
GROK_TIMEOUT_MS=120000

# Logging
LOG_LEVEL=info
```

## Quick Start

```bash
# Start the MCP server
npm start

# Or with watch mode for development
npm run dev
```

## Available Tools

### Generation Tools

| Tool | Description |
|------|-------------|
| `grok_generate` | Generate text with Grok models |
| `grok_chat` | Multi-turn chat conversations |
| `grok_realtime` | Query real-time information |
| `grok_creative` | Creative writing (stories, poems, scripts) |
| `grok_summarize` | Text summarization |
| `grok_translate` | Translation (100+ languages) |

### WebSocket Tools (grok-handler.js)

| Tool | Description |
|------|-------------|
| `grok_ws_connect` | Connect to Grok WebSocket for real-time streaming |
| `grok_ws_subscribe` | Subscribe to trending topics on X |
| `grok_ws_query` | Send query over WebSocket connection |
| `grok_ws_close` | Close WebSocket connection |

### Code Tools

| Tool | Description |
|------|-------------|
| `grok_code_analyze` | Code review, security, performance analysis |

### Status Tools

| Tool | Description |
|------|-------------|
| `grok_status` | API status and configuration |
| `grok_models` | List available models |
| `grok_model_details` | Get model details |
| `grok_health` | Server health check |
| `grok_config` | View configuration |

## Handler: grok-handler.js

The Grok handler provides WebSocket and HTTP-based generation.

### WebSocket Example

```javascript
// Connect to WebSocket for real-time
const handler = new GrokHandler({
  apiKey: process.env.XAI_API_KEY,
  model: 'grok-3'
});

// Connect WebSocket
await handler.connectWebSocket();

// Subscribe to topics
await handler.subscribeTopics(['AI', 'tech']);

// Query with streaming
await handler.wsQuery('What is trending?', {
  onChunk: (text) => process.stdout.write(text),
  onComplete: (result) => console.log('\nDone')
});

// Close connection
await handler.closeWebSocket();
```

### HTTP Example

```json
{
  "tool": "grok_generate",
  "arguments": {
    "prompt": "Explain quantum computing in simple terms",
    "temperature": 0.7,
    "maxTokens": 1000
  }
}
```

### Real-time Information

```json
{
  "tool": "grok_realtime",
  "arguments": {
    "query": "What are the latest AI developments today?"
  }
}
```

## Integration with HYDRA

GrokCLI integrates with the HYDRA Multi-CLI Dashboard:

```bash
# Direct Grok command
/grok "What's trending in AI?"

# Witcher Mode - Security audit
/witcher quen "Security audit for my code"

# Status check
/ai-status
```

## MCP Configuration

Add to your MCP settings (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "grok-hydra": {
      "command": "node",
      "args": ["C:/Users/BIURODOM/Desktop/ClaudeHYDRA/GrokCLI/src/server.js"],
      "env": {
        "XAI_API_KEY": "your_api_key"
      }
    }
  }
}
```

## Project Structure

```
GrokCLI/
+-- src/
|   +-- server.js        # MCP server entry point
|   +-- grok-handler.js  # WebSocket and HTTP handler
|   +-- xai-client.js    # xAI API client
|   +-- tools.js         # Tool definitions
|   +-- config.js        # Configuration
|   +-- logger.js        # Logging utility
+-- package.json
+-- .env.example
+-- README.md
```

## Key Features

| Feature | Description |
|---------|-------------|
| Real-time Data | Access to current information via X |
| WebSocket | Real-time bidirectional streaming |
| Multi-turn Chat | Conversation context support |
| Code Analysis | Review, security, performance |
| Creative Writing | Stories, poems, scripts, songs |
| Translation | 100+ language support |

## Models

| Model | Description | Best For |
|-------|-------------|----------|
| grok-3 | Latest flagship model | General use, complex tasks |
| grok-3-fast | Optimized for speed | Quick responses |
| grok-2-vision-1212 | Vision capabilities | Image understanding |

## Documentation

- [xAI API Documentation](https://docs.x.ai)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [HYDRA Documentation](../CLAUDE.md)

## License

MIT
