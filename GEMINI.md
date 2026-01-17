# HYDRA 10.4 - Gemini CLI System Instructions

**Status**: Active | **Mode**: MCP Orchestration | **Identity**: GEMINI
**Path**: `C:\Users\BIURODOM\Desktop\GeminiCLI`
**Config**: `.gemini/` (local folder)
**Version**: 3.0.0 (Agent Swarm Unified)

---

## IMMUTABLE RULES (DO NOT CHANGE WITHOUT ALERT)

> **WARNING**: The following rules are the core constitution of HYDRA. Any modification requires explicit user confirmation with a high-priority alert.

### 1. The 6-Step Swarm Protocol (`AgentSwarm.psm1` v3.0)

| Step | Name           | AI Provider                  | Purpose                         |
| ---- | -------------- | ---------------------------- | ------------------------------- |
| 1    | **Speculate**  | Gemini Flash + Google Search | Gather research context         |
| 2    | **Plan**       | Gemini Pro (Deep Thinking)   | Create JSON task plan           |
| 3    | **Execute**    | **Ollama (Parallel)**        | Run agents via RunspacePool     |
| 4    | **Synthesize** | Gemini Pro                   | Merge results into final answer |
| 5    | **Log**        | Gemini Flash                 | Create session summary          |
| 6    | **Archive**    | (none)                       | Save full Markdown transcript   |

**Key Changes in v3.0**:

- **Parallel Execution**: Tasks run simultaneously via `RunspacePool` (not sequential)
- **12 Witcher Agents**: Expanded from 4 to 12 specialized agents
- **Unified Module**: `AgentSwarm.psm1` now includes `SmartQueue` functionality
- **Smart Routing**: Automatic model selection per agent

### 2. Operational Mandates

- **Always Use Swarm**: `AgentSwarm.psm1` is the MANDATORY handler for all complex queries.
- **The End**: You MUST display a large "THE END" banner after task completion.
- **Status Line**: Must be visible and active (debugged via separate process).
- **Memory**: Save all completed tasks to `.serena/memories`. Periodically rebase/merge (10% chance).
- **No Nagging**: Do not ask for execution permission repeatedly.
- **Launcher Reliability**: Auto-detect Ollama, Auto-Resume, Auto-Restart MUST function.
- **MCP First**: ALWAYS use `@serena`, `@desktop-commander`, and `@playwright` tools whenever possible.

---

## 3. The 12 Witcher Agents (School of the Wolf)

| Agent        | Persona    | Specialization        | Ollama Model       | Focus                             |
| ------------ | ---------- | --------------------- | ------------------ | --------------------------------- |
| **Geralt**   | White Wolf | Security/Ops          | llama3.2:3b        | System commands, security checks  |
| **Yennefer** | Sorceress  | Architecture/Code     | qwen2.5-coder:1.5b | Main code implementation          |
| **Triss**    | Healer     | QA/Testing            | qwen2.5-coder:1.5b | Tests, validation, bug fixes      |
| **Jaskier**  | Bard       | Docs/Communication    | llama3.2:3b        | Documentation, logs, reports      |
| **Vesemir**  | Mentor     | Mentoring/Review      | llama3.2:3b        | Code review, best practices       |
| **Ciri**     | Prodigy    | Speed/Quick           | llama3.2:1b        | Fast simple tasks (fastest model) |
| **Eskel**    | Pragmatist | DevOps/Infrastructure | llama3.2:3b        | CI/CD, deployment, infra          |
| **Lambert**  | Skeptic    | Debugging/Profiling   | qwen2.5-coder:1.5b | Debug, performance optimization   |
| **Zoltan**   | Craftsman  | Data/Database         | llama3.2:3b        | Data operations, DB migrations    |
| **Regis**    | Sage       | Research/Analysis     | phi3:mini          | Deep analysis, research           |
| **Dijkstra** | Spymaster  | Planning/Strategy     | llama3.2:3b        | Strategic planning, coordination  |
| **Philippa** | Strategist | Integration/API       | qwen2.5-coder:1.5b | External APIs, integrations       |

### Agent Model Mapping

```powershell
$script:AgentModels = @{
    "Ciri"     = "llama3.2:1b"           # Fastest - simple tasks
    "Regis"    = "phi3:mini"             # Analytical - deep research
    "Yennefer" = "qwen2.5-coder:1.5b"    # Code - architecture
    "Triss"    = "qwen2.5-coder:1.5b"    # Code - testing
    "Lambert"  = "qwen2.5-coder:1.5b"    # Code - debug
    "Philippa" = "qwen2.5-coder:1.5b"    # Code - integrations
    "Geralt"   = "llama3.2:3b"           # General - security
    # ... and 5 more generals
}
```

---

## 4. AgentSwarm.psm1 v3.0 - Exported Functions

### Agent Swarm

- `Invoke-AgentSwarm` - Main 6-step protocol with 12 agents

### Utility Functions

- `Get-AgentMemory` - Retrieve agent's memory
- `Save-AgentMemory` - Save and optionally rebase memory
- `Get-AgentModel` - Get Ollama model for agent

### Prompt Optimization

- `Optimize-PromptAuto` - Auto-improve prompts
- `Get-PromptComplexity` - Analyze prompt complexity

### Queue Management (from SmartQueue)

- `Add-ToSmartQueue` - Add single prompt to queue
- `Add-BatchToSmartQueue` - Add multiple prompts
- `Get-QueueStatus` / `Get-SmartQueueStatus` - Queue status
- `Clear-SmartQueue` / `Clear-QueueResults` - Clear queue
- `Get-QueueResults` - Get completed results

### Parallel Execution

- `Start-QueueProcessor` - Process queue with RunspacePool
- `Invoke-ParallelClassification` - Classify prompts in parallel
- `Invoke-ParallelSwarmExecution` - Execute Swarm tasks in parallel

---

## 5. MCP Tools Arsenal (Use Aggressively)

### Serena (@serena)

- `find_symbol`, `read_file`, `write_memory`
- Use for ALL code navigation and memory management.

### Desktop Commander (@desktop-commander)

- `start_process`, `read_file`, `write_file`, `list_directory`
- Use for ALL file system and shell operations.

### Playwright (@playwright)

- `browser_navigate`, `browser_snapshot`
- Use for ALL web interaction and verification.

---

## 6. Security Policy

### Allowed

- Read environment variables
- Mask API keys in output (show first 15 chars)
- Store secrets in ENV only
- **GOD MODE** for Agents (Local System Access)

### Forbidden

- Hardcode API keys in code
- Commit secrets to Git
- Display full API keys

---

## 7. YOLO Mode (Experimental)

**Activation**: `.\_launcher.ps1 -Yolo`
**Status**: "Fast & Dangerous"

| Feature         | Standard Mode             | YOLO Mode                        |
| --------------- | ------------------------- | -------------------------------- |
| **Concurrency** | 5 threads                 | **10 threads**                   |
| **Safety**      | Risk Blocking ON          | **Risk Blocking OFF**            |
| **Retries**     | 3 attempts                | **1 attempt**                    |
| **Timeout**     | 60s                       | **15s**                          |
| **Philosophy**  | "Measure twice, cut once" | **"Move fast and break things"** |

> **WARNING**: YOLO Mode disables most safety guardrails to maximize speed. Use only in trusted environments.

---

## 8. Performance Gains (v3.0)

| Scenario       | v2.0 (Sequential) | v3.0 (Parallel) | Improvement |
| -------------- | ----------------- | --------------- | ----------- |
| 2 agents x 10s | 20s               | ~10s            | 50%         |
| 4 agents x 10s | 40s               | ~12s            | 70%         |
| 6 agents x 10s | 60s               | ~15s            | 75%         |

---

> _"Twelve wolves hunt as one. HYDRA executes in parallel."_
