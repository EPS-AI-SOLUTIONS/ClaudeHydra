# MCP Tools Documentation

## Core Tools (@serena)

| Tool Name | Description |
|-----------|-------------|
| `find_symbol` | Finds code symbols (classes, functions) by name. |
| `read_file` | Reads file content. |
| `write_memory` | Saves knowledge to long-term memory. |

## Desktop Commander (@desktop-commander)

| Tool Name | Description |
|-----------|-------------|
| `start_process` | Starts a shell process. |
| `run_shell_command` | Executes a single shell command. |
| `list_directory` | Lists files in a directory. |
| `write_file` | Writes content to a file. |

## Hydra Swarm (@gemini)

| Tool Name | Description |
|-----------|-------------|
| `hydra_swarm` | Initiates the 6-step Swarm Protocol with specialized agents. |
| `ollama_generate` | Generates text using local Ollama models. |
| `prompt_optimize` | Optimizes prompts for better results. |

## Usage Examples

### Running a Swarm
```json
{
  "prompt": "Refactor the login module",
  "agents": ["Yennefer", "Triss"]
}
```
