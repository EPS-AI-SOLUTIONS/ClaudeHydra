---
description: "HYDRA 10.6.1 - Unified Orchestration (Serena + DC + Agent Swarm)"
---

# HYDRA 10.6.1 - Unified Orchestration

**Status: ACTIVE** | 10 Agents × 5 Domains | MCP Integration

```
┌─────────────────────────────────────────────────────────────────┐
│  🐉 HYDRA 10.6.1 - CLI EDITION                                  │
│  ════════════════════════════════════════════════════════       │
│  [●] Serena            → Symbolic code analysis                 │
│  [●] Desktop Commander → System operations                      │
│  [●] Agent Swarm       → 10 Agents (5 domains)                  │
│                                                                 │
│  Mode: Claude CLI │ Autonomy: $AUTONOMY_LEVEL                   │
└─────────────────────────────────────────────────────────────────┘
```

## AGENT SWARM (10 Agents × 5 Domains)

| Domain | Agents | Specialty |
|--------|--------|-----------|
| 🏗️ **ARCHITECTURE** | Architect, Planner | System design, task breakdown |
| 🔍 **ANALYSIS** | Researcher, Analyst | Investigation, data analysis |
| 💻 **IMPLEMENTATION** | Coder, Refactorer | Code writing, cleanup |
| ✅ **QUALITY** | Tester, Reviewer | Testing, code review |
| 📚 **DOCUMENTATION** | Documenter, Explainer | Docs, explanations |

## ROUTING PATTERNS

```
design|architect|structure     → Architect
plan|breakdown|sprint          → Planner
research|investigate|find      → Researcher
analyze|metrics|data           → Analyst
implement|code|write|build     → Coder
refactor|clean|optimize        → Refactorer
test|validate|verify           → Tester
review|pr|diff|feedback        → Reviewer
document|readme|api docs       → Documenter
explain|clarify|teach          → Explainer
```

## UNIFIED WORKFLOWS

### 1. Feature Implementation
```bash
# Step 1: Plan
/hydra plan "Add dark mode toggle to settings"

# Step 2: Implement
mcp__serena__find_symbol("ThemeProvider")
mcp__serena__replace_symbol_body("ThemeProvider", $newCode)

# Step 3: Test
mcp__desktop-commander__start_process("pnpm test")

# Step 4: Document
/hydra document "Dark mode feature"
```

### 2. Code Review Pipeline
```bash
# Analyze changes
/hydra review "src/auth/*.ts"

# Security audit
/hydra research "Security implications of JWT refresh"

# Test coverage
/hydra test "Generate edge cases for auth module"
```

### 3. Debug Workflow
```bash
# Gather context
mcp__serena__find_symbol("ErrorComponent")
mcp__desktop-commander__read_file("error.log")

# Analyze with Analyst
/hydra analyze "Error patterns in logs"

# Fix
/hydra refactor "Handle edge cases in ErrorComponent"
```

## SWARM PROTOCOL (6 Steps)

```
┌─────────────────────────────────────────────────────────────────┐
│  1. ROUTE      → Analyze query, select agent(s)                 │
│  2. SPECULATE  → Researcher gathers context                     │
│  3. PLAN       → Planner creates task breakdown                 │
│  4. EXECUTE    → Domain agents run (parallel reads, seq writes) │
│  5. SYNTHESIZE → Combine results, resolve conflicts             │
│  6. REPORT     → Format response per HYDRA contract             │
└─────────────────────────────────────────────────────────────────┘
```

## MUTEX RULES

| Operation | Allowed | Lock |
|-----------|---------|------|
| READ parallel | ✅ Yes | None |
| WRITE sequential | ✅ Yes | File lock |
| WRITE parallel | ❌ No | - |
| Conflict | ⚠️ Abort + Report | - |

## RESPONSE CONTRACT (MANDATORY)

Every HYDRA response MUST include:

1. **📊 Visual Summary** - Table/diagram showing outcomes
2. **✅ Actions Taken** - Numbered list of concrete actions
3. **📌 Next Steps (5)** - Exactly five proposals
4. **🎯 CONFIDENCE_SCORE** - 0.0 to 1.0

## IRON LAW (NEVER BREAK)

```
⛔ SAFETY > AUTONOMY
⛔ DETERMINISM > CREATIVITY
⛔ NO GUESSING
⛔ NO HALLUCINATIONS
⛔ NO DESTRUCTIVE OPS WITHOUT CONFIRMATION
```

## QUICK COMMANDS

```bash
# Full swarm (auto-route)
/hydra "Implement user authentication"

# Specific domain
/hydra architect "Design microservice structure"
/hydra code "Add JWT refresh to auth.ts"
/hydra test "Write unit tests for auth module"
/hydra review "Check PR #42"
/hydra explain "How does the caching layer work?"

# Status & Config
/hydra status      # Check swarm health
/hydra config      # View/modify settings
```

## FALLBACK CHAIN

```
Anthropic → OpenAI → Google → Mistral → Groq → Ollama
```

> ⚠️ Fallback is ALWAYS disclosed in response

---

## DOCUMENTS

| File | Purpose |
|------|---------|
| `.claude/hydra/HYDRA_CORE.md` | Core specification |
| `.claude/hydra/HYDRA_AGENTS.md` | Agent contracts |
| `.claude/hydra/HYDRA_SECURITY.md` | Security policy |
| `.claude/hydra/HYDRA_FILES.md` | File handling |
| `.claude/hydra/rules.json` | Rule registry (28 rules) |

---

ARGUMENTS: $ARGUMENTS
