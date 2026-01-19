---
description: "Jules CLI - Google's Async Coding Agent for GitHub"
---

# 🟣 JULES CLI - Async Coding Agent

```
┌─────────────────────────────────────────────────────────────────┐
│  🟣 JULES CLI                                                   │
│  ════════════════════════════════════════════════════════       │
│  Provider: Google                                               │
│  Mode: Asynchronous Task Delegation                             │
│  Specialty: Background coding, GitHub integration               │
│  Feature: Delegates tasks to Jules AI - runs while you sleep!   │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Installation

```bash
# Install globally via npm
npm install -g @google/jules

# Verify installation
jules --version
```

## 🔐 Authentication

```bash
# Login (opens browser for Google OAuth)
jules login

# Check auth status
jules whoami

# Logout
jules logout
```

## 📋 Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `jules` | Launch interactive TUI dashboard | `jules` |
| `jules login` | Authenticate with Google | `jules login` |
| `jules logout` | Sign out | `jules logout` |
| `jules version` | Show version | `jules version` |
| `jules remote list --repo` | List connected repos | `jules remote list --repo` |
| `jules remote list --session` | List all sessions | `jules remote list --session` |
| `jules remote new` | Create async task | See below |
| `jules remote pull` | Fetch completed results | See below |
| `jules completion` | Generate shell completions | `jules completion bash` |

## 🎯 Best Use Cases

| Task | Why Jules? |
|------|------------|
| **Background refactoring** | Runs async while you work |
| **Test generation** | Delegated overnight tasks |
| **Documentation** | Async doc updates |
| **Bug fixes** | Queue tasks for later |

## 💡 Usage Examples

### Create Async Task
```bash
# Delegate a coding task to Jules
jules remote new \
  --repo myorg/myapp \
  --session "Add comprehensive unit tests for auth module"

# With specific branch
jules remote new \
  --repo myorg/myapp \
  --branch feature/tests \
  --session "Refactor database queries for performance"
```

### Monitor Sessions
```bash
# List all active sessions
jules remote list --session

# Output:
# ID      | Status     | Repo          | Task
# 123456  | running    | myorg/myapp   | Add unit tests...
# 123457  | completed  | myorg/myapp   | Refactor database...
```

### Pull Completed Work
```bash
# Fetch results from completed session
jules remote pull --session 123457

# Creates PR or applies changes locally
```

### Interactive Dashboard
```bash
# Launch TUI
jules

# Features:
# - Session overview
# - Change browser
# - Create new tasks
# - Pull results
```

## ⚙️ Configuration

### Global Flags
```bash
jules --theme dark  # Use dark theme
jules --theme light # Use light theme
jules -h            # Show help
```

### Shell Completions
```bash
# Bash
jules completion bash >> ~/.bashrc

# Zsh
jules completion zsh >> ~/.zshrc

# Fish
jules completion fish > ~/.config/fish/completions/jules.fish

# PowerShell
jules completion powershell >> $PROFILE
```

## 🔄 Workflow: Async Task Delegation

```
┌─────────────────────────────────────────────────────────────────┐
│  1. CREATE   → jules remote new --repo X --session "task"       │
│  2. DELEGATE → Jules AI works in background                     │
│  3. MONITOR  → jules remote list --session                      │
│  4. PULL     → jules remote pull --session ID                   │
│  5. REVIEW   → Review changes, merge PR                         │
└─────────────────────────────────────────────────────────────────┘
```

## 🔗 Integration with HYDRA

```bash
# Via HYDRA Dashboard
/dashboard jules "Write tests for auth module"

# Via Witcher Mode
/witcher "Generate comprehensive test suite"
# → Routes async tasks to Jules

# Direct command
/jules "Add documentation for API endpoints"
```

## 📚 Resources

- **Documentation:** https://jules.google/docs/cli/reference/
- **Getting Started:** https://jules.google/docs/getting-started
- **GitHub Integration:** https://jules.google/docs/github

---

## 📊 Session States

| State | Meaning | Action |
|-------|---------|--------|
| `queued` | Waiting to start | Wait |
| `running` | Jules is working | Monitor |
| `completed` | Task done | Pull results |
| `failed` | Error occurred | Check logs |
| `cancelled` | User cancelled | Retry if needed |

---

## ⚠️ Limitations

- Requires GitHub repository access
- One session per repo at a time (default)
- Results expire after 30 days
- Large repos may take longer

---

ARGUMENTS: $ARGUMENTS
