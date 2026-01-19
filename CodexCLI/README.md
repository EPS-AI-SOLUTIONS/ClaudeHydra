# CodexCLI - OpenAI MCP Server for HYDRA

```
+---------------------------------------------------------------------+
|  CODEX CLI - OpenAI Code Agent                                       |
|  ====================================================================
|  Provider: OpenAI                                                    |
|  Models: GPT-4o / GPT-4o-mini / o1-preview                          |
|  Features: MCP, Self-Correction, Streaming, Code Review, Batch       |
|  Protocol: Model Context Protocol (MCP)                              |
+---------------------------------------------------------------------+
```

## Overview

CodexCLI is an MCP (Model Context Protocol) server that integrates OpenAI's GPT models into the HYDRA ecosystem. It provides:

- Text generation with GPT-4o and o1-series models
- Streaming code generation with real-time output
- Self-correcting code generation
- Code review, debugging, and refactoring
- Test generation
- Batch processing and model comparison

## Installation

```bash
# Navigate to CodexCLI directory
cd CodexCLI

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env and add your OpenAI API key
# OPENAI_API_KEY=sk-your-api-key-here
```

## Configuration

Edit `.env` file:

```bash
# Required
OPENAI_API_KEY=sk-your-api-key-here

# Model Configuration
CODEX_DEFAULT_MODEL=gpt-4o
CODEX_CODER_MODEL=gpt-4o
CODEX_FAST_MODEL=gpt-4o-mini

# Generation Defaults
CODEX_TEMPERATURE=0.3
CODEX_MAX_TOKENS=4096
```

## Running the Server

```bash
# Start MCP server
npm start

# Or directly
node src/server.js
```

## Available Tools

### Streaming Tools (codex-handler.js)

| Tool | Description |
|------|-------------|
| `codex_stream` | Stream text generation with real-time SSE output |
| `codex_stream_code` | Stream code with syntax validation |
| `codex_stream_review` | Stream code review results in real-time |

### Generation Tools

| Tool | Description |
|------|-------------|
| `codex_generate` | Generate text with GPT models |
| `codex_batch` | Process multiple prompts in parallel |
| `codex_chain` | Chain multiple prompts together |
| `codex_compare` | Compare outputs from multiple models |

### Code Tools

| Tool | Description |
|------|-------------|
| `codex_code` | Generate code with self-correction |
| `codex_review` | Comprehensive code review |
| `codex_explain` | Explain code functionality |
| `codex_refactor` | Refactor code for improvements |
| `codex_test` | Generate unit tests |
| `codex_debug` | Analyze and fix bugs |

### Utility Tools

| Tool | Description |
|------|-------------|
| `codex_status` | API status and configuration |
| `codex_models` | List available models |
| `codex_model_details` | Get model information |
| `codex_health` | Health check |
| `codex_config` | Current configuration |

## Handler: codex-handler.js

The Codex handler provides streaming and self-correction capabilities.

### Streaming Example

```javascript
const handler = new CodexHandler({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o'
});

// Stream code generation
await handler.streamCode(prompt, {
  language: 'typescript',
  onChunk: (text) => process.stdout.write(text),
  onComplete: (result) => console.log('\nDone:', result.usage)
});
```

### Self-Correction Example

```javascript
// Code with automatic validation and retry
const result = await handler.selfCorrect(prompt, {
  language: 'typescript',
  maxAttempts: 3,
  validator: (code) => validateTypeScript(code)
});
```

## Tool Examples

### Code Generation with Self-Correction

```json
{
  "tool": "codex_code",
  "arguments": {
    "prompt": "Create a TypeScript function that validates email addresses",
    "language": "typescript",
    "maxAttempts": 3
  }
}
```

### Streaming Code Review

```json
{
  "tool": "codex_stream_review",
  "arguments": {
    "code": "function add(a, b) { return a + b; }",
    "language": "javascript",
    "focusAreas": ["security", "performance", "maintainability"]
  }
}
```

### Batch Processing

```json
{
  "tool": "codex_batch",
  "arguments": {
    "prompts": [
      "Explain async/await in JavaScript",
      "What is a closure?",
      "Describe event loop"
    ],
    "model": "gpt-4o-mini",
    "maxConcurrent": 3
  }
}
```

## Integration with HYDRA

Add to your Claude MCP configuration:

```json
{
  "mcpServers": {
    "codex-hydra": {
      "command": "node",
      "args": ["C:/path/to/CodexCLI/src/server.js"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key"
      }
    }
  }
}
```

## HYDRA Slash Commands

```bash
# Direct Codex usage
/codex "Generate REST API endpoints"

# Witcher Mode routing to Codex
/witcher aard "Fast code generation"
```

## Project Structure

```
CodexCLI/
+-- src/
|   +-- server.js          # MCP server entry point
|   +-- codex-handler.js   # Streaming and self-correction handler
|   +-- openai-client.js   # OpenAI API wrapper
|   +-- tools.js           # MCP tool definitions
|   +-- config.js          # Configuration management
|   +-- logger.js          # Logging utility
+-- package.json
+-- .env.example
+-- README.md
```

## Key Features

| Feature | Description |
|---------|-------------|
| Streaming | Real-time SSE code generation |
| Self-Correction | Automatic retry with validation |
| Code Review | Security, performance, maintainability |
| Batch Processing | Parallel prompt processing |
| Model Comparison | Compare outputs across models |

## Security Features

- Prompt risk detection (injection attempts)
- Risk blocking mode (HYDRA_RISK_BLOCKING)
- API key masking in logs
- Input validation for all tools

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | - | Required. Your OpenAI API key |
| `OPENAI_BASE_URL` | api.openai.com/v1 | Custom API endpoint |
| `CODEX_DEFAULT_MODEL` | gpt-4o | Default generation model |
| `CODEX_CODER_MODEL` | gpt-4o | Code generation model |
| `CODEX_FAST_MODEL` | gpt-4o-mini | Fast/cheap model |
| `CODEX_TEMPERATURE` | 0.3 | Default temperature |
| `CODEX_MAX_TOKENS` | 4096 | Max tokens per request |
| `HYDRA_YOLO` | false | Disable safety checks |
| `HYDRA_RISK_BLOCKING` | true | Block risky prompts |
| `LOG_LEVEL` | info | Logging verbosity |

## Requirements

- Node.js >= 20
- OpenAI API key (paid account recommended for gpt-4o)

## License

MIT

---

Part of the HYDRA Multi-CLI Dashboard ecosystem.
