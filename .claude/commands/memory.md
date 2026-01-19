---
description: "Manage Serena memories and chat context"
---

# 🧠 MEMORY - Serena Memory Manager

```
┌─────────────────────────────────────────────────────────────────┐
│  🧠 SERENA MEMORY MANAGER                                       │
│  ════════════════════════════════════════════════════════       │
│  Automatic memory creation and context tracking                 │
│  Chat history integration for persistent context                │
└─────────────────────────────────────────────────────────────────┘
```

## ⚡ AUTO-CONTEXT PROTOCOL

When this command is invoked, load and display current memory context:

```bash
node .claude/scripts/memory-manager.js context
```

## 📋 Commands

| Command | Description |
|---------|-------------|
| `/memory` | Show current context and memories |
| `/memory list` | List all memories |
| `/memory get <name>` | Get specific memory content |
| `/memory save <name> <content>` | Create new memory |
| `/memory update` | Analyze codebase and update memories |
| `/memory history` | Show chat history |

## 🗂️ Memory Types

### Core Memories (Auto-generated)
| Memory | Description |
|--------|-------------|
| `project_purpose` | Project overview and goals |
| `tech_stack` | Technology stack details |
| `code_conventions` | Coding standards and patterns |
| `development_commands` | Available commands and scripts |
| `codebase_structure` | Directory structure (auto-scanned) |
| `api_keys_status` | API key availability |
| `active_models` | Currently available AI models |

### Context Tracking
| Context | Source |
|---------|--------|
| Recent topics | Extracted from chat history |
| Recent files | Files mentioned in conversations |
| Recent commands | Commands used in session |

## 💡 Usage Examples

### View Current Context
```bash
/memory
```

### Update All Memories
```bash
/memory update
```

### Get Specific Memory
```bash
/memory get tech_stack
```

### Save Custom Memory
```bash
/memory save project_notes "Important notes about the project..."
```

## 🔄 Auto-Update Triggers

Memories are automatically updated when:
1. HYDRA initializes (`hydra-init.js`)
2. `/memory update` is called
3. Significant codebase changes detected

## 📁 Storage Location

```
.serena/
├── memories/
│   ├── project_purpose.md
│   ├── tech_stack.md
│   ├── code_conventions.md
│   ├── development_commands.md
│   ├── codebase_structure.md
│   ├── api_keys_status.md
│   ├── active_models.md
│   ├── chat_history.json
│   └── current_context.md
└── project.yml
```

## 🔗 Integration

Memories are automatically:
- Loaded at HYDRA startup
- Included in provider init messages
- Used to build context for AI queries
- Updated based on chat interactions

---

ARGUMENTS: $ARGUMENTS
