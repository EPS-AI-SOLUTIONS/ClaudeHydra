---
description: "Quick local AI query using Ollama (cost=$0)"
---

# /ai - Quick Local AI Query

Execute a quick AI query using local Ollama models. Zero cost, fast response.

## Usage

```
/ai <your question or task>
/ai analyze <file>
/ai summarize <text>
/ai code <description>
/ai memory <name>
```

## Examples

```
/ai explain this error: TypeError undefined is not a function
/ai write a regex to match email addresses
/ai analyze src/main.ts
/ai summarize: <paste text>
/ai code function to sort array
/ai memory tech_stack
```

## Instructions for Claude

When the user invokes `/ai`, execute using the ollama-handler:

```bash
node .claude/scripts/ollama-handler.js query $ARGUMENTS
```

**Sub-commands:**
- `query <prompt>` - General query (default)
- `analyze <file>` - Analyze code file
- `summarize <text>` - Summarize content
- `code <desc>` - Generate code
- `memory <name>` - Query a Serena memory
- `status` - Check Ollama status

**Important:**
1. Always use local Ollama (cost=$0)
2. Display the full response to user
3. Supports streaming output

## Model Selection

| Task | Model | Why |
|------|-------|-----|
| General | `llama3.2:3b` | Best quality |
| Code | `qwen2.5-coder:1.5b` | Code specialist |
| Fast | `llama3.2:1b` | Fastest |
| Reasoning | `phi3:mini` | Better logic |

## Integration

The `/ai` command integrates with:
- **Serena Memories** - Query project knowledge
- **Memory Manager** - AI-powered memory search
- **HYDRA Init** - Context-aware responses

## Query: $ARGUMENTS
