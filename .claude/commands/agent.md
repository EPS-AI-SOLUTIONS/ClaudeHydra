---
description: "Invoke a specific HYDRA agent directly"
---

# HYDRA Agent Direct Invoke

**Available Agents:** 10 agents across 5 domains

```
┌─────────────────────────────────────────────────────────────────┐
│  🐺 DIRECT AGENT INVOCATION                                     │
├─────────────────────────────────────────────────────────────────┤
│  Usage: /agent <agent_name> <task>                              │
│                                                                 │
│  Example: /agent coder "Add JWT refresh logic to auth.ts"       │
│           /agent tester "Write unit tests for UserService"      │
│           /agent reviewer "Review changes in PR #42"            │
└─────────────────────────────────────────────────────────────────┘
```

## Available Agents

### 🏗️ ARCHITECTURE

| Agent | Command | Specialty |
|-------|---------|-----------|
| **Architect** | `/agent architect` | System design, diagrams |
| **Planner** | `/agent planner` | Task breakdown, estimates |

### 🔍 ANALYSIS

| Agent | Command | Specialty |
|-------|---------|-----------|
| **Researcher** | `/agent researcher` | Investigation, context |
| **Analyst** | `/agent analyst` | Data analysis, metrics |

### 💻 IMPLEMENTATION

| Agent | Command | Specialty |
|-------|---------|-----------|
| **Coder** | `/agent coder` | Code writing |
| **Refactorer** | `/agent refactorer` | Code cleanup, optimization |

### ✅ QUALITY

| Agent | Command | Specialty |
|-------|---------|-----------|
| **Tester** | `/agent tester` | Test generation |
| **Reviewer** | `/agent reviewer` | Code review |

### 📚 DOCUMENTATION

| Agent | Command | Specialty |
|-------|---------|-----------|
| **Documenter** | `/agent documenter` | README, API docs |
| **Explainer** | `/agent explainer` | Explanations, tutorials |

## Agent Contract

Every agent follows:

```yaml
INPUT: What it accepts
OUTPUT: What it produces
FAILURE_MODE: How it fails gracefully
```

## Examples

```bash
# Architecture
/agent architect "Design authentication microservice"
/agent planner "Break down dark mode feature into tasks"

# Analysis
/agent researcher "Find best practices for React Query"
/agent analyst "Analyze error rates from logs"

# Implementation
/agent coder "Implement OAuth2 refresh token flow"
/agent refactorer "Extract common logic from UserService"

# Quality
/agent tester "Generate edge case tests for auth module"
/agent reviewer "Review security of token validation"

# Documentation
/agent documenter "Write API docs for /users endpoint"
/agent explainer "Explain the caching strategy"
```

---

ARGUMENTS: $ARGUMENTS
