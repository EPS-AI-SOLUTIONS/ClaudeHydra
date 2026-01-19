# 🔴 DeepSeek CLI

```
┌─────────────────────────────────────────────────────────────────┐
│  DEEPSEEK CLI - Code Intelligence                               │
│  ════════════════════════════════════════════════════════       │
│  Provider: DeepSeek                                             │
│  Models: DeepSeek-R1 / DeepSeek-Coder                           │
│  Features: 100+ languages, Local mode via Ollama                │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
# Via npm
npm install -g run-deepseek-cli

# Via Docker
docker run -it -v $(pwd):/workspace -e DEEPSEEK_API_KEY=your_key deepseek/cli
```

## Configuration

### API Mode
```bash
export DEEPSEEK_API_KEY="your-api-key"
```

### Local Mode (Ollama)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull model
ollama pull deepseek-r1

# Setup CLI
deepseek setup
```

## Quick Start

```bash
# Start interactive mode
deepseek

# Single prompt
deepseek chat "Write a binary search in Python"
```

## Key Features

| Feature | Description |
|---------|-------------|
| 🌐 100+ Languages | Any programming language |
| 📁 Repo Understanding | Analyzes entire codebases |
| 🏠 Local Mode | Run offline via Ollama |
| 💰 Cost-effective | Cheaper than alternatives |

## Best For

- Multi-language projects
- Local/offline coding
- Budget-conscious usage
- Complex reasoning (R1)

## Documentation

https://github.com/holasoymalva/deepseek-cli

## Integration with HYDRA

```bash
/deepseek "Convert Python to Rust"
/witcher "Multi-language task"  # Routes to DeepSeek
```
