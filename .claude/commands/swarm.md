---
description: "HYDRA Full Swarm Protocol - Multi-agent orchestration"
---

# HYDRA Swarm Protocol

**Mode:** Full orchestration with automatic agent routing

```
┌─────────────────────────────────────────────────────────────────┐
│  🐺 SWARM PROTOCOL (6 Steps)                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ROUTE      → Analyze query, select agent(s)                 │
│  2. SPECULATE  → Researcher gathers context                     │
│  3. PLAN       → Planner creates task breakdown                 │
│  4. EXECUTE    → Domain agents run in parallel/sequential       │
│  5. SYNTHESIZE → Combine results, resolve conflicts             │
│  6. REPORT     → Format response per HYDRA contract             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Usage

```bash
# Auto-route to best agents
/swarm "Implement user authentication with OAuth2"

# Specify agents
/swarm --agents "coder,tester,reviewer" "Add login endpoint"

# With priority
/swarm --priority quality "Refactor auth module"
```

## Execution Modes

| Mode | Behavior | Use When |
|------|----------|----------|
| **AUTO** | System selects agents | Default |
| **MANUAL** | User specifies agents | Complex tasks |
| **PRIORITY** | Favor specific domain | Domain-critical work |

## Priority Domains

```bash
/swarm --priority architecture  # Design-focused
/swarm --priority analysis      # Research-heavy
/swarm --priority implementation # Code-heavy
/swarm --priority quality       # Testing-focused
/swarm --priority documentation # Docs-focused
```

## Parallel vs Sequential

### Parallel (READ operations)
- File reading
- Symbol lookup
- Analysis
- Research

### Sequential (WRITE operations)
- File modification
- Code generation
- Test execution

## Example: Full Feature Implementation

```
Query: "Implement user profile page with avatar upload"

Step 1 - ROUTE:
  → Architect (design), Coder (implement), Tester (tests)

Step 2 - SPECULATE:
  → Researcher gathers: existing patterns, file upload libs

Step 3 - PLAN:
  → Planner creates:
    - T1: Component structure
    - T2: Avatar upload hook
    - T3: API integration
    - T4: Unit tests
    - T5: E2E test

Step 4 - EXECUTE:
  → Parallel: T1, T2
  → Sequential: T3 (depends on T1, T2)
  → Parallel: T4, T5

Step 5 - SYNTHESIZE:
  → Merge all outputs
  → Resolve conflicts
  → Verify consistency

Step 6 - REPORT:
  → Visual summary
  → Actions taken
  → 5 next steps
  → CONFIDENCE_SCORE
```

## Conflict Resolution

```
IF conflict_detected:
    1. ABORT conflicting operations
    2. REPORT conflict details
    3. AWAIT resolution (auto or human)
    4. RESUME with resolved state
```

## Response Contract

Every swarm response includes:

1. **📊 Visual Summary** - Multi-agent execution diagram
2. **✅ Actions Taken** - Per-agent action list
3. **📌 Next Steps (5)** - Coordinated follow-ups
4. **🎯 CONFIDENCE_SCORE** - Aggregate confidence

---

ARGUMENTS: $ARGUMENTS
