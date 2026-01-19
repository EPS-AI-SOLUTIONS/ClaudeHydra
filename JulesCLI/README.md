# 🟣 Jules CLI

```
┌─────────────────────────────────────────────────────────────────┐
│  JULES CLI - Google Async Coding Agent                          │
│  ════════════════════════════════════════════════════════       │
│  Provider: Google                                               │
│  Mode: Asynchronous Task Delegation                             │
│  Feature: Background coding while you sleep!                    │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install -g @google/jules
```

## Authentication

```bash
# Login (opens browser)
jules login

# Logout
jules logout
```

## Quick Start

```bash
# Launch interactive TUI
jules

# Create async task
jules remote new --repo owner/repo --session "Add unit tests"

# Check sessions
jules remote list --session

# Pull completed work
jules remote pull --session 123456
```

## Key Commands

| Command | Description |
|---------|-------------|
| `jules` | Launch TUI dashboard |
| `jules remote new` | Create async task |
| `jules remote list` | List repos/sessions |
| `jules remote pull` | Fetch completed results |

## Best For

- Background refactoring
- Test generation overnight
- Documentation updates
- Bug fixes (queue for later)

## Documentation

https://jules.google/docs/cli/reference/

## Integration with HYDRA

```bash
/jules "Create tests for auth module"
/witcher yrden "Background task"  # Routes to Jules
```
