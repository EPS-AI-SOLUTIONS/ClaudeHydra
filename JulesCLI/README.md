# JulesCLI - Google Async Coding Agent for HYDRA

```
+---------------------------------------------------------------------+
|  JULES CLI - Google Async Coding Agent                               |
|  ====================================================================
|  Provider: Google                                                    |
|  Mode: Asynchronous Task Delegation                                  |
|  Features: Background coding, GitHub integration, Async polling      |
|  Protocol: Model Context Protocol (MCP)                              |
+---------------------------------------------------------------------+
```

## Overview

JulesCLI is an MCP server that provides integration with Google's Jules async coding agent for the HYDRA Multi-CLI Dashboard. It enables:

- Asynchronous background task delegation
- GitHub repository integration
- Task status polling and webhooks
- Background code generation, testing, and documentation

## Installation

```bash
# Navigate to JulesCLI directory
cd JulesCLI

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

## Configuration

### Required

Google authentication is required:

```bash
# Login (opens browser for OAuth)
jules login

# Or set OAuth token directly
GOOGLE_OAUTH_TOKEN=ya29...
```

### Optional Settings

```bash
# Task defaults
JULES_DEFAULT_PRIORITY=2
JULES_POLL_INTERVAL=2000
JULES_MAX_POLL_ATTEMPTS=150

# Webhook
JULES_WEBHOOK_URL=https://your-server.com/webhooks/jules

# Logging
LOG_LEVEL=info
```

## Quick Start

```bash
# Start the MCP server
npm start

# Launch interactive TUI
jules

# Create async task
jules remote new --repo owner/repo --session "Add unit tests"

# Check sessions
jules remote list --session

# Pull completed work
jules remote pull --session 123456
```

## Available Tools

### Task Management (jules-handler.js)

| Tool | Description |
|------|-------------|
| `jules_delegate` | Delegate async task to Jules |
| `jules_status` | Check task status and progress |
| `jules_cancel` | Cancel running task |
| `jules_list` | List all tasks |
| `jules_pull` | Pull completed task results |
| `jules_logs` | Get task execution logs |

### Repository Tools

| Tool | Description |
|------|-------------|
| `jules_repos` | List connected repositories |
| `jules_connect_repo` | Connect new repository |
| `jules_disconnect_repo` | Disconnect repository |

## Handler: jules-handler.js

The Jules handler manages async task delegation and polling.

### Delegate Task

```javascript
const handler = new JulesHandler({
  oauthToken: process.env.GOOGLE_OAUTH_TOKEN
});

// Delegate async task
const task = await handler.delegate({
  description: 'Generate unit tests for auth module',
  type: 'test-generation',
  priority: 2,
  repo: 'owner/repo',
  branch: 'feature/tests',
  metadata: {
    targetFiles: ['src/auth/*.js'],
    testFramework: 'jest'
  }
});

console.log('Task ID:', task.id);
```

### Poll Status

```javascript
// Poll for completion
const result = await handler.pollStatus(task.id, {
  interval: 2000,
  maxAttempts: 150,
  onProgress: (status) => console.log(`Progress: ${status.progress}%`)
});

console.log('Result:', result);
```

### Pull Results

```javascript
// Pull completed results
const results = await handler.pullResults(task.id);
console.log('Files:', results.output.files);
```

## Tool Examples

### Delegate Task

```json
{
  "tool": "jules_delegate",
  "arguments": {
    "description": "Add comprehensive unit tests for the authentication module",
    "type": "test-generation",
    "priority": 2,
    "repo": "myorg/myapp",
    "branch": "feature/auth-tests",
    "metadata": {
      "targetFiles": ["src/auth/*.ts"],
      "testFramework": "jest",
      "coverage": 80
    }
  }
}
```

### Check Status

```json
{
  "tool": "jules_status",
  "arguments": {
    "taskId": "jules-1737312000000-a1b2c3d4"
  }
}
```

### Pull Results

```json
{
  "tool": "jules_pull",
  "arguments": {
    "taskId": "jules-1737312000000-a1b2c3d4"
  }
}
```

## Task Types

| Type | Description | Typical Duration |
|------|-------------|------------------|
| `code-generation` | Generate new code | 5-10s |
| `test-generation` | Generate unit tests | 8-15s |
| `refactoring` | Refactor existing code | 10-20s |
| `documentation` | Generate docs | 4-8s |
| `bug-fix` | Fix identified bugs | 6-12s |
| `general` | General tasks | 3-5s |

## Task Statuses

| Status | Description |
|--------|-------------|
| `pending` | Task created, waiting to be processed |
| `queued` | Task queued for execution |
| `running` | Task currently executing |
| `completed` | Task finished successfully |
| `failed` | Task failed with error |
| `cancelled` | Task cancelled by user |

## Integration with HYDRA

```bash
# Direct Jules command
/jules "Create tests for auth module"

# Witcher Mode - Background task
/witcher yrden "Background task delegation"
```

## MCP Configuration

Add to your Claude MCP configuration:

```json
{
  "mcpServers": {
    "jules-hydra": {
      "command": "node",
      "args": ["C:/path/to/JulesCLI/src/server.js"],
      "env": {
        "GOOGLE_OAUTH_TOKEN": "ya29..."
      }
    }
  }
}
```

## Project Structure

```
JulesCLI/
+-- src/
|   +-- server.js         # MCP server entry point
|   +-- jules-handler.js  # Task delegation and polling handler
|   +-- jules-client.js   # Jules API client
|   +-- tools.js          # MCP tool definitions
|   +-- config.js         # Configuration
|   +-- logger.js         # Logging utility
+-- package.json
+-- .env.example
+-- README.md
```

## Key Features

| Feature | Description |
|---------|-------------|
| Async Tasks | Background code generation |
| GitHub Integration | Direct repository access |
| Polling | Automatic status polling |
| Webhooks | Real-time completion notifications |
| Task Logs | Detailed execution logs |

## Best Use Cases

- Background refactoring
- Test generation overnight
- Documentation updates
- Bug fixes (queue for later)
- Large-scale code changes

## CLI Commands

| Command | Description |
|---------|-------------|
| `jules` | Launch TUI dashboard |
| `jules login` | Authenticate with Google |
| `jules logout` | Sign out |
| `jules remote new` | Create async task |
| `jules remote list` | List repos/sessions |
| `jules remote pull` | Fetch completed results |
| `jules version` | Show version |

## Documentation

- [Jules Documentation](https://jules.google/docs/cli/reference/)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [HYDRA Documentation](../CLAUDE.md)

## License

MIT

---

Part of the HYDRA Multi-CLI Dashboard ecosystem.
