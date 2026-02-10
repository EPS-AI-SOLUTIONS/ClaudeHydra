# ClaudeHydra Debug Logging Guide

## Poziomy Logowania

ClaudeHydra posiada wielopoziomowy system logowania oparty na kolorowych labelkach:

| Poziom | Emoji/Color | Opis | Kiedy Używać |
|--------|-------------|------|--------------|
| **ERROR** | 🔴 `[ERROR]` | Krytyczne błędy | Awarie, crashe, błędy MCP |
| **WARN**  | 🟡 `[WARN]` | Ostrzeżenia | Deprecated features, slow queries |
| **INFO**  | 🔵 `[INFO]` | Podstawowe info | Query completion, agent selection |
| **DEBUG** | 🟣 `[DEBUG]` | Szczegóły techniczne | MCP calls, Ollama params, agent routing |
| **TRACE** | ⚪ `[TRACE]` | Wszystko | Full request/response dumps |

---

## Uruchamianie z Logowaniem

### 1. **Standardowy Mode (INFO)**
```bash
pnpm start
# Pokazuje tylko podstawowe informacje:
# - Który agent został wybrany
# - Czas wykonania query
# - Sukces/porażka
```

### 2. **Verbose Mode (DEBUG)**
```bash
pnpm start --verbose
# LUB
LOG_LEVEL=DEBUG pnpm start
```

**Output:**
```
[INFO]  ClaudeHydra CLI v3.0.0
[DEBUG] 🤖 Selected: Jaskier - Auto-selected (score: 2.50)
        topScores: ["Jaskier:2.5", "Vesemir:1.0", "Geralt:0.5"]
[DEBUG] Processing query {
  agent: "Jaskier",
  model: "qwen3:4b",
  temperature: 0.8,
  streaming: false,
  promptLength: 456
}
[DEBUG] Ollama → /api/generate {
  model: "qwen3:4b",
  tokens: 150,
  temperature: 0.8,
  penalties: { repeat: 1.5, frequency: 1.2 }
}
[TRACE] Ollama ← /api/generate {
  tokens_generated: 87,
  duration_ms: 1234,
  response_preview: "ClaudeHydra używa 12 agentów Witcher-themed..."
}
[INFO]  Query completed in 1234ms {
  responseLength: 245,
  cached: false
}
```

---

### 3. **Trace Mode (TRACE)**
```bash
pnpm start --trace
# LUB
LOG_LEVEL=TRACE pnpm start
```

**Output:** Jak DEBUG + pełne JSONy request/response z MCP i Ollama.

---

## Logowanie per Moduł

### **AgentRouter** (`[AgentRouter]`)
```
[DEBUG] 🤖 Selected: Yennefer - Auto-selected (score: 3.00)
        topScores: ["Yennefer:3.0", "Dijkstra:2.5", "Regis:1.5"]
```

- **Pokazuje:** Który agent został wybrany i dlaczego (top 3 scores)
- **Kiedy:** Przy każdym query w trybie auto-select

---

### **QueryProcessor** (`[QueryProcessor]`)
```
[DEBUG] Processing query {
  agent: "Geralt",
  model: "qwen3:4b",
  temperature: 0.3,
  streaming: false,
  promptLength: 128
}
[INFO]  Query completed in 567ms { responseLength: 89, cached: false }
```

- **Pokazuje:** Parametry query + czas wykonania
- **Kiedy:** Przed i po każdym wywołaniu AI

---

### **LlamaCppBridge** (`[LlamaCppBridge]`)
```
[DEBUG] Ollama → /api/generate {
  model: "qwen3:4b",
  tokens: 150,
  temperature: 0.7,
  penalties: { repeat: 1.5, frequency: 1.2 }
}
[TRACE] Ollama ← /api/generate {
  tokens_generated: 102,
  duration_ms: 1456,
  response_preview: "Mam kilka pomysli dotyczących swojego..."
}
```

- **Pokazuje:** Pełne parametry wysyłane do Ollama + response stats
- **Kiedy:** Przy każdym wywołaniu Ollama API

---

### **MCPClientManager** (`[MCPClientManager]`)
```
[DEBUG] MCP → mcp__ollama__ollama_generate {
  params: { prompt: "...", model: "qwen3:4b", ... }
}
[TRACE] MCP ← mcp__ollama__ollama_generate {
  response: { content: "...", success: true }
}
```

- **Pokazuje:** Wszystkie wywołania MCP tools
- **Kiedy:** Przy każdym request do MCP serwera

---

## Zmienne Środowiskowe

| Zmienna | Opis | Przykład |
|---------|------|----------|
| `LOG_LEVEL` | Poziom logowania | `LOG_LEVEL=DEBUG pnpm start` |
| `LOG_TIMESTAMPS` | Włącz timestampy | `LOG_TIMESTAMPS=1 pnpm start` |
| `FORCE_COLOR` | Włącz kolory | `FORCE_COLOR=3 pnpm start` |

---

## Kombinacje Użyteczne

### **Debugowanie Repetycji**
```bash
LOG_LEVEL=TRACE pnpm start --verbose
# Pokaże pełne parametry Ollama (repeat_penalty, frequency_penalty)
# + pełną odpowiedź przed i po deduplication
```

### **Debugowanie Wyboru Agenta**
```bash
LOG_LEVEL=DEBUG pnpm start
# Pokaże top 3 agentów z scorami dla każdego query
```

### **Debugowanie MCP Connection**
```bash
LOG_LEVEL=DEBUG pnpm start 2>&1 | grep MCP
# Filtruj tylko logi związane z MCP
```

### **Performance Profiling**
```bash
LOG_TIMESTAMPS=1 LOG_LEVEL=DEBUG pnpm start
# Timestampy pokażą dokładnie gdzie jest bottleneck
```

---

## Przykładowy Output (--verbose)

```
[21:37:42.123] [UnifiedCLI] [INFO]  Verbose mode enabled (DEBUG level)
[21:37:42.456] [INFO]  ClaudeHydra CLI v3.0.0
[21:37:42.789] [INFO]  Mode: swarm

HYDRA> podaj swój pipeline z modelami ai

[21:37:45.012] [AgentRouter] [DEBUG] 🤖 Selected: Jaskier - Auto-selected (score: 2.50) {
  topScores: [ 'Jaskier:2.5', 'Vesemir:1.0', 'Geralt:0.5' ]
}
[21:37:45.034] [QueryProcessor] [DEBUG] Processing query {
  agent: 'Jaskier',
  model: 'qwen3:4b',
  temperature: 0.8,
  streaming: false,
  promptLength: 456
}
[21:37:45.056] [LlamaCppBridge] [DEBUG] Ollama → /api/generate {
  model: 'qwen3:4b',
  tokens: 150,
  temperature: 0.8,
  penalties: { repeat: 1.5, frequency: 1.2 }
}
[21:37:46.289] [LlamaCppBridge] [TRACE] Ollama ← /api/generate {
  tokens_generated: 87,
  duration_ms: 1233,
  response_preview: 'ClaudeHydra używa lokalnie Ollama (qwen3:4b) + Anthropic API...'
}
[21:37:46.301] [QueryProcessor] [INFO]  Query completed in 1267ms {
  responseLength: 245,
  cached: false
}

ClaudeHydra używa lokalnie Ollama (qwen3:4b) + Anthropic API dla chmury.
Pipeline: QueryProcessor → AgentRouter → LlamaCppBridge → Ollama.

HYDRA>
```

---

## FAQ

**Q: Dlaczego nie widzę logów MCP?**
A: Upewnij się że `LOG_LEVEL=DEBUG` lub `--verbose`. MCP logi są na poziomie DEBUG.

**Q: Jak wyłączyć kolory?**
A: `FORCE_COLOR=0 pnpm start`

**Q: Jak zapisać logi do pliku?**
A: `pnpm start --verbose 2>&1 | tee debug.log`

**Q: Timestampy są w złej strefie czasowej?**
A: Logger używa `toLocaleTimeString('pl-PL')` - zmień locale w `src/utils/logger.ts`

---

## Zgłaszanie Bugów

Przy zgłaszaniu bugów **zawsze dołącz**:
```bash
LOG_LEVEL=TRACE LOG_TIMESTAMPS=1 pnpm start > bug-report.log 2>&1
```

Output z `--trace` zawiera wszystkie potrzebne informacje dla deweloperów.
