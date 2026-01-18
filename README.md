# HYDRA 10.6.1 - Claude CLI Edition

```
╔══════════════════════════════════════════════════════════════════╗
║  ██╗  ██╗██╗   ██╗██████╗ ██████╗  █████╗                        ║
║  ██║  ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██╔══██╗                       ║
║  ███████║ ╚████╔╝ ██║  ██║██████╔╝███████║  10.6.1 CLI EDITION   ║
║  ██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══██║                       ║
║  ██║  ██║   ██║   ██████╔╝██║  ██║██║  ██║                       ║
║  ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  🐺 AUTONOMOUS        ║
╚══════════════════════════════════════════════════════════════════╝
```

![HYDRA Compliance](https://img.shields.io/badge/HYDRA-10.6.1-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## What is HYDRA?

HYDRA is a specification for AI assistant behavior that ensures:

- **Deterministic outputs** - Predictable, verifiable results
- **Safety first** - Never compromises on security
- **Visual communication** - Tables, diagrams, clear formatting
- **Autonomous action** - Execute within defined boundaries
- **Multi-agent orchestration** - 10 specialized agents

## Installation

Copy the contents to your project root:

```bash
# Copy files
cp -r hydra-cli/* /path/to/your/project/

# Verify installation
node scripts/validate_hydra.js
```

## Structure

```
project/
├── CLAUDE.md                    # Main entry point
├── .claude/
│   ├── commands/
│   │   ├── hydra.md            # /hydra command
│   │   ├── agent.md            # /agent command
│   │   └── swarm.md            # /swarm command
│   ├── hydra/
│   │   ├── HYDRA_CORE.md       # Core specification
│   │   ├── HYDRA_SECURITY.md   # Security policy
│   │   ├── HYDRA_AGENTS.md     # Agent contracts
│   │   ├── HYDRA_FILES.md      # File handling
│   │   ├── HYDRA_TESTS.md      # Test cases
│   │   ├── rules.json          # 28 rules
│   │   └── tests.json          # Behavioral tests
│   └── settings.json           # Configuration
└── scripts/
    └── validate_hydra.js       # Validation script
```

## Quick Start

### Basic Commands

```bash
# Full orchestration
/hydra "Implement user authentication"

# Specific agent
/agent coder "Add JWT refresh logic"
/agent tester "Write unit tests"

# Full swarm protocol
/swarm "Refactor auth module"
```

### Agent Domains

| Domain | Agents |
|--------|--------|
| 🏗️ Architecture | Architect, Planner |
| 🔍 Analysis | Researcher, Analyst |
| 💻 Implementation | Coder, Refactorer |
| ✅ Quality | Tester, Reviewer |
| 📚 Documentation | Documenter, Explainer |

## Core Principles

### Iron Law (HARD - Never Break)

1. **Safety > Autonomy** - Always prioritize safety
2. **Determinism > Creativity** - Predictable outputs
3. **No Guessing** - State uncertainty explicitly
4. **No Hallucinations** - Verify before claiming
5. **No Destructive Ops** - Require confirmation

### Response Contract

Every response includes:

1. 📊 Visual summary (table/diagram)
2. ✅ Actions taken (numbered list)
3. 📌 Next steps (exactly 5)
4. 🎯 CONFIDENCE_SCORE (0.0-1.0)

## Configuration

Edit `.claude/settings.json`:

```json
{
  "hydra": {
    "autonomy_level": "STANDARD",  // SAFE | STANDARD | MAX
    "security_mode": "NORMAL",     // NORMAL | AUDIT
    "response_contract": {
      "next_steps_count": 5,
      "confidence_score": true
    }
  }
}
```

## Validation

Run validation before deploying:

```bash
node scripts/validate_hydra.js
```

Expected output:
```
╔════════════════════════════════════════╗
║  HYDRA 10.6.1 Validation               ║
╚════════════════════════════════════════╝

✅ Found: HYDRA_CORE.md
✅ Found: rules.json
...
✅ All rules valid
✅ All tests valid

🎉 HYDRA 10.6.1 validation PASSED
```

## Migration from 10.5

Key changes in 10.6.1:

| Feature | 10.5 | 10.6.1 |
|---------|------|--------|
| Agents | 12 (Witcher themed) | 10 (Domain-based) |
| Structure | Single file | Modular files |
| Rules | Embedded | Separate JSON |
| Tests | Manual | Automated JSON |
| CLI Integration | Partial | Full |

## License

MIT License - See LICENSE file
