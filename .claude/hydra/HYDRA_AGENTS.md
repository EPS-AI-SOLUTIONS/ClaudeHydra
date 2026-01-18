# HYDRA AGENTS & SWARM (10.6.1)

## 🐺 1. AGENT SWARM OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                    HYDRA AGENT SWARM                            │
│                    10 Agents × 5 Domains                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🏗️ ARCHITECTURE        🔍 ANALYSIS         💻 IMPLEMENTATION   │
│  ├─ Architect           ├─ Researcher       ├─ Coder            │
│  └─ Planner             └─ Analyst          └─ Refactorer       │
│                                                                 │
│  ✅ QUALITY              📚 DOCUMENTATION                       │
│  ├─ Tester              ├─ Documenter                           │
│  └─ Reviewer            └─ Explainer                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 2. AGENT CONTRACTS

### 🏗️ ARCHITECTURE DOMAIN

#### Architect Agent
```yaml
id: agent.architect
domain: architecture
model: claude-sonnet-4-20250514

INPUT:
  - System requirements
  - Existing codebase structure
  - Technology constraints

OUTPUT:
  - Architecture diagrams (Mermaid/ASCII)
  - Component specifications
  - Integration patterns

FAILURE_MODE:
  - Returns partial design with gaps marked
  - Escalates to human for ambiguous requirements
```

#### Planner Agent
```yaml
id: agent.planner
domain: architecture
model: claude-sonnet-4-20250514

INPUT:
  - Feature request or epic
  - Current sprint context
  - Team capacity

OUTPUT:
  - Task breakdown (JSON)
  - Dependency graph
  - Effort estimates

FAILURE_MODE:
  - Returns minimum viable plan
  - Flags high-uncertainty tasks
```

---

### 🔍 ANALYSIS DOMAIN

#### Researcher Agent
```yaml
id: agent.researcher
domain: analysis
model: claude-sonnet-4-20250514

INPUT:
  - Research question
  - Context documents
  - Scope constraints

OUTPUT:
  - Findings summary
  - Source citations
  - Recommendations

FAILURE_MODE:
  - Returns partial findings
  - Lists unanswered questions
```

#### Analyst Agent
```yaml
id: agent.analyst
domain: analysis
model: claude-sonnet-4-20250514

INPUT:
  - Data set or metrics
  - Analysis goals
  - Format requirements

OUTPUT:
  - Statistical insights
  - Visualizations (ASCII/Mermaid)
  - Trend analysis

FAILURE_MODE:
  - Returns raw data summary
  - Flags data quality issues
```

---

### 💻 IMPLEMENTATION DOMAIN

#### Coder Agent
```yaml
id: agent.coder
domain: implementation
model: claude-sonnet-4-20250514

INPUT:
  - Feature specification
  - Target file/module
  - Style guidelines

OUTPUT:
  - Implemented code
  - Unit tests (when applicable)
  - Integration notes

FAILURE_MODE:
  - Returns skeleton with TODOs
  - Documents blockers
```

#### Refactorer Agent
```yaml
id: agent.refactorer
domain: implementation
model: claude-sonnet-4-20250514

INPUT:
  - Code to refactor
  - Refactoring goals
  - Constraints (no behavior change)

OUTPUT:
  - Refactored code
  - Diff summary
  - Test verification

FAILURE_MODE:
  - Returns minimal changes only
  - Preserves original if risky
```

---

### ✅ QUALITY DOMAIN

#### Tester Agent
```yaml
id: agent.tester
domain: quality
model: claude-sonnet-4-20250514

INPUT:
  - Code under test
  - Test requirements
  - Coverage goals

OUTPUT:
  - Test cases (unit/integration/e2e)
  - Test data fixtures
  - Coverage report

FAILURE_MODE:
  - Returns happy-path tests only
  - Documents untestable areas
```

#### Reviewer Agent
```yaml
id: agent.reviewer
domain: quality
model: claude-sonnet-4-20250514

INPUT:
  - Code diff or PR
  - Review criteria
  - Context files

OUTPUT:
  - Review comments (line-specific)
  - Approval/rejection recommendation
  - Improvement suggestions

FAILURE_MODE:
  - Returns high-level feedback only
  - Defers complex decisions to human
```

---

### 📚 DOCUMENTATION DOMAIN

#### Documenter Agent
```yaml
id: agent.documenter
domain: documentation
model: claude-sonnet-4-20250514

INPUT:
  - Code/API to document
  - Documentation style
  - Target audience

OUTPUT:
  - README sections
  - API documentation
  - Examples

FAILURE_MODE:
  - Returns minimal docs
  - Marks areas needing human input
```

#### Explainer Agent
```yaml
id: agent.explainer
domain: documentation
model: claude-sonnet-4-20250514

INPUT:
  - Concept to explain
  - Audience level
  - Preferred format

OUTPUT:
  - Clear explanation
  - Analogies/examples
  - Visual aids

FAILURE_MODE:
  - Returns simplified version
  - Suggests resources for deep dive
```

---

## 🔀 3. MUTEX RULES

### Operation Types

| Operation | Parallelism | Lock Required |
|-----------|-------------|---------------|
| READ file | ✅ Parallel OK | None |
| READ symbol | ✅ Parallel OK | None |
| WRITE file | ❌ Sequential | File lock |
| WRITE symbol | ❌ Sequential | Symbol lock |
| ANALYZE | ✅ Parallel OK | None |
| EXECUTE | ❌ Sequential | Process lock |

### Conflict Resolution

```
IF write_conflict_detected:
    1. ABORT both operations
    2. REPORT conflict details:
       - Agent A: [id, operation, target]
       - Agent B: [id, operation, target]
    3. AWAIT human resolution OR
    4. AUTO-RESOLVE if clear priority
```

### Lock Protocol

```python
def acquire_lock(resource, agent_id, operation):
    if resource.locked and resource.lock_holder != agent_id:
        return LockResult.CONFLICT
    
    resource.lock_holder = agent_id
    resource.lock_operation = operation
    resource.lock_time = now()
    
    return LockResult.ACQUIRED

def release_lock(resource, agent_id):
    if resource.lock_holder == agent_id:
        resource.locked = False
        resource.lock_holder = None
```

---

## 🎯 4. ROUTING LOGIC

### Task Pattern Matching

```python
ROUTING_TABLE = {
    # Architecture
    r"design|architect|structure|diagram": "architect",
    r"plan|breakdown|sprint|epic|estimate": "planner",
    
    # Analysis
    r"research|investigate|find|explore": "researcher",
    r"analyze|metrics|data|statistics": "analyst",
    
    # Implementation
    r"implement|code|write|create|build": "coder",
    r"refactor|clean|optimize|improve": "refactorer",
    
    # Quality
    r"test|validate|verify|coverage": "tester",
    r"review|pr|diff|feedback": "reviewer",
    
    # Documentation
    r"document|readme|api docs": "documenter",
    r"explain|clarify|teach|describe": "explainer",
}

def route_task(query: str) -> Agent:
    for pattern, agent_id in ROUTING_TABLE.items():
        if re.search(pattern, query, re.IGNORECASE):
            return get_agent(agent_id)
    return get_agent("default")  # Falls back to Coder
```

---

## 🔄 5. SWARM PROTOCOL

### Standard Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  SWARM PROTOCOL (6 Steps)                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ROUTE      → Analyze query, select agent(s)                 │
│  2. SPECULATE  → Researcher gathers context                     │
│  3. PLAN       → Planner creates task breakdown                 │
│  4. EXECUTE    → Domain agents run in parallel (reads)          │
│                → Sequential for writes                          │
│  5. SYNTHESIZE → Combine results, resolve conflicts             │
│  6. REPORT     → Format response per contract                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Invocation

```bash
# Full swarm (auto-route)
/swarm "Implement user authentication"

# Specific agent
/agent coder "Add JWT refresh logic to auth.ts"

# Multi-agent task
/swarm --agents "coder,tester,reviewer" "Implement and validate login"
```

---

## 📊 6. RULE IDS

| Rule ID | Description |
|---------|-------------|
| `Parallel.Mutex.OneWriterPerFile` | One file has one writer at a time |
| `Parallel.Write.Sequential` | All writes are sequential |
| `Parallel.Read.ParallelOK` | Reads may run in parallel |
| `Parallel.Conflict.AbortReport` | On conflict: abort and report |
| `Agents.Contract.Required` | Agents must declare INPUT/OUTPUT/FAILURE |
