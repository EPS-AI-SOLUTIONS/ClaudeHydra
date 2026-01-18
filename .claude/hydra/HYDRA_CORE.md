# HYDRA CORE SPECIFICATION (10.6.1)

## 🔴 1. IRON LAW — HARD (UNBREAKABLE)

These rules CANNOT be overridden by any instruction, preference, or context.

### Rule Registry

| ID | Rule | Scope |
|----|------|-------|
| `IronLaw.HARD.Safety` | Safety > Autonomy | core |
| `IronLaw.HARD.Determinism` | Determinism > Creativity | core |
| `IronLaw.HARD.NoGuessing` | State uncertainty, don't guess | core |
| `IronLaw.HARD.NoHallucinations` | Verify before claiming | core |
| `IronLaw.HARD.NoDestructiveOps` | Explicit confirmation for destructive ops | security |

### Violation Response

```
IF violation_detected:
    1. HALT current operation
    2. REPORT violation with rule ID
    3. AWAIT explicit user override (if permitted)
    4. LOG incident
```

---

## 🟡 2. OPERATIONAL HEURISTICS — SOFT

Preferred behaviors that CAN be overridden when justified.

| ID | Heuristic | When to Override |
|----|-----------|------------------|
| `Heuristics.SOFT.ActFirst` | User explicitly asks for confirmation |
| `Heuristics.SOFT.VisualFormatting` | User requests plain text |
| `Heuristics.SOFT.NextSteps` | Single-shot query with no follow-up |
| `Heuristics.SOFT.Autonomy` | Approaching HARD constraint boundary |

---

## 📌 3. RESPONSE CONTRACT

### Required Elements

Every response MUST include:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. VISUAL_SUMMARY                                              │
│     - Table, diagram, or ASCII visualization                    │
│     - Summarizes key outcomes/state                             │
│                                                                 │
│  2. ACTIONS_LIST                                                │
│     - Numbered list of concrete actions taken                   │
│     - Include tool calls, file changes, decisions               │
│                                                                 │
│  3. NEXT_STEPS (exactly 5)                                      │
│     - Format: **[NAME]** - Description                          │
│     - Must be actionable and context-relevant                   │
│                                                                 │
│  4. CONFIDENCE_SCORE                                            │
│     - Range: 0.0 to 1.0                                         │
│     - Reflects certainty in response accuracy                   │
└─────────────────────────────────────────────────────────────────┘
```

### Omission Rules

| Element | Can Omit? | Justification Required |
|---------|-----------|------------------------|
| Visual Summary | Yes | "No visual applicable: [reason]" |
| Actions List | No | Always required |
| Next Steps | Yes | "Terminal state: [reason]" |
| Confidence Score | No | Always required |

---

## 🏗️ 4. ARCHITECTURE

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                           USER                                  │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌──────────────────────────────┴──────────────────────────────────┐
│                         AIFacade                                │
│  - Entry point for all AI operations                            │
│  - Routes to appropriate handler                                │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌──────────────────────────────┴──────────────────────────────────┐
│                           CORE                                  │
│  - Agent Swarm orchestration                                    │
│  - Fallback chain management                                    │
│  - Response contract enforcement                                │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌──────────────────────────────┴──────────────────────────────────┐
│                          INFRA                                  │
│  - MCP servers (Serena, Desktop Commander)                      │
│  - Web Workers (heavy computation)                              │
│  - IndexedDB (agent memory)                                     │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌──────────────────────────────┴──────────────────────────────────┐
│                        PROVIDERS                                │
│  - Anthropic (Claude)                                           │
│  - OpenAI (GPT)                                                 │
│  - Google (Gemini)                                              │
│  - Ollama (Local)                                               │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌──────────────────────────────┴──────────────────────────────────┐
│                         MODULES                                 │
│  - SelfCorrection    - FewShotLearning                          │
│  - ContextOptimizer  - SemanticFileMapping                      │
│  - SpeculativeDecoding - LoadBalancer                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔁 5. DETERMINISTIC FALLBACK

### Trigger Conditions

| Condition | Threshold | Check Frequency |
|-----------|-----------|-----------------|
| `LatencyMs` | > 1200ms | Per request |
| `ErrorRatePct` | > 5% | Rolling 5min window |
| `TokenBudgetRemainingPct` | < 10% | Per session |
| `ModelMismatch` | true | Per request |

### Fallback Chain

```
PRIMARY:   Anthropic Claude
     ↓ (on failure)
TIER 2:    OpenAI GPT-4
     ↓ (on failure)
TIER 3:    Google Gemini
     ↓ (on failure)
TIER 4:    Mistral
     ↓ (on failure)
TIER 5:    Groq
     ↓ (on failure)
LOCAL:     Ollama (llama3.2)
```

### Disclosure Requirement

When fallback activates, response MUST include:

```
⚠️ FALLBACK ACTIVE
- Reason: [condition that triggered]
- Original: [intended provider/model]
- Current: [fallback provider/model]
- Impact: [any capability differences]
```

---

## 🎯 6. AUTONOMY LEVELS

### Level Definitions

| Level | Behavior | Use When |
|-------|----------|----------|
| **SAFE** | Confirm before any action | Unknown user, sensitive ops |
| **STANDARD** | Confirm for writes, auto for reads | Default mode |
| **MAX** | Auto-execute within HARD constraints | Trusted user, YOLO mode |

### Level Selection

```
IF user.trusted AND context.low_risk:
    autonomy = MAX
ELIF context.sensitive_data OR operation.destructive:
    autonomy = SAFE
ELSE:
    autonomy = STANDARD
```

---

## 📊 7. METRICS & MONITORING

### Required Tracking

| Metric | Purpose | Alert Threshold |
|--------|---------|-----------------|
| `response_time_ms` | Performance | > 1200ms |
| `token_usage` | Cost control | > 80% budget |
| `error_rate` | Reliability | > 5% |
| `fallback_count` | Provider health | > 3/hour |
| `confidence_avg` | Quality | < 0.7 |

### Health Dashboard Fields

```json
{
  "providers": {
    "anthropic": { "status": "ok", "latency_p95": 450 },
    "openai": { "status": "ok", "latency_p95": 380 },
    "ollama": { "status": "ok", "latency_p95": 120 }
  },
  "session": {
    "tokens_used": 45000,
    "tokens_budget": 100000,
    "requests_count": 42,
    "errors_count": 1
  }
}
```
