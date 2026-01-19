---
description: "Grok CLI - xAI's Real-time Conversational AI"
---

# ⚫ GROK CLI - xAI Agent

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚫ GROK CLI                                                    │
│  ════════════════════════════════════════════════════════       │
│  Provider: xAI (Elon Musk)                                      │
│  Model: Grok 3                                                  │
│  Mode: Conversational AI                                        │
│  Specialty: Real-time data, X/Twitter integration, Unfiltered   │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Installation

```bash
# Via npm
npm install -g @vibe-kit/grok-cli

# Verify installation
grok --version
```

## 🔐 Authentication

```bash
# Option 1: Environment variable
export XAI_API_KEY="your-xai-api-key"

# Option 2: Interactive auth
grok auth

# Option 3: Config file
echo '{"apiKey": "your-key"}' > ~/.grok/config.json
```

## 📋 Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `grok` | Start interactive mode | `grok` |
| `grok chat "query"` | Single query | `grok chat "Latest AI news"` |
| `grok --help` | Show all commands | `grok --help` |
| `grok auth` | Configure authentication | `grok auth` |

## 🎯 Key Features

| Feature | Description |
|---------|-------------|
| 💬 **Conversational AI** | Natural chat in terminal |
| 📝 **Text Editor** | Intelligent editing capabilities |
| ⚡ **Real-time Data** | Access to current information |
| 🔓 **Less Restrictive** | More direct responses |
| 🐦 **X Integration** | Twitter/X data access |

## 💡 Usage Examples

### Interactive Chat
```bash
# Start session
grok

# In chat:
> What's the latest news about AI development?
> Explain quantum computing in simple terms
> Help me debug this Python code
```

### Single Query
```bash
# Quick question
grok chat "What happened in tech today?"

# Code help
grok chat "How do I implement a binary tree in Rust?"
```

### Real-time Research
```bash
grok

> What are people saying about the new iPhone on X?
> Summarize today's top tech news
> What's trending in programming?
```

## ⚙️ Configuration

### Environment Variables
```bash
export XAI_API_KEY="..."
export GROK_MODEL="grok-3"
export GROK_TEMPERATURE="0.7"
```

### Config File: `~/.grok/config.json`
```json
{
  "apiKey": "your-xai-api-key",
  "model": "grok-3",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

## 🔗 Integration with HYDRA

```bash
# Via HYDRA Dashboard
/dashboard grok "Real-time research task"

# Via Witcher Mode
/witcher "Research current best practices for microservices"
# → Routes real-time queries to Grok

# Direct command
/grok "What's the latest on Rust async/await?"
```

## 📚 Resources

- **Website:** https://grokcli.io/
- **GitHub:** https://github.com/superagent-ai/grok-cli
- **xAI:** https://x.ai/
- **API Access:** Requires X Premium or xAI API key

---

## 📊 Grok vs Others

| Aspect | Grok | Others |
|--------|------|--------|
| Real-time | ✅ Yes | ❌ Limited |
| X/Twitter | ✅ Native | ❌ No |
| Filtering | 🔓 Less | 🔒 More |
| Humor | 😄 Yes | 😐 Limited |

---

## ⚠️ Notes

- Requires xAI API key or X Premium
- Real-time features depend on X data access
- Responses may be more "edgy" than other AIs
- Best for current events and social trends

---

## 🎭 Grok Personality

Grok is known for:
- Witty, sometimes sarcastic responses
- Willingness to discuss controversial topics
- Real-time awareness of current events
- Integration with X/Twitter ecosystem

---

ARGUMENTS: $ARGUMENTS
