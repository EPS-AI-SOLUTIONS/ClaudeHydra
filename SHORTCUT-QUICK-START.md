# 🚀 Szybkie Tworzenie Skrótu na Pulpicie

## ⚠️ WAŻNE: Poprawiona Komenda CLI

Skróty teraz używają `pnpm hydra` zamiast `pnpm start`:
- `pnpm start` = MCP Server (backend)
- `pnpm hydra` = CLI Interface (frontend) ✅

---

## Metoda 1: Double-Click ⭐ (Najprostsza)

```
Double-click na jeden z plików:

📁 create-both-shortcuts.bat     (Batch - Windows)
📁 create-both-shortcuts.vbs     (VBScript - Uniwersalny)
```

**Utworzy 2 skróty:**
- 🐍 **ClaudeHydra CLI.lnk** - Standardowy Swarm Mode
- 🔍 **ClaudeHydra CLI (Verbose).lnk** - Swarm Mode + Debug Logging

---

## Metoda 2: NPM Script

```bash
pnpm run shortcut:both
```

**LUB dla pojedynczych:**
```bash
pnpm run shortcut          # Tylko standardowy
pnpm run shortcut:verbose  # Tylko verbose
pnpm run shortcut:all      # Wszystkie 5 wariantów
```

---

## Metoda 3: Node.js

```bash
node scripts/create-both-shortcuts-node.js
```

---

## Co Robi Każdy Skrót?

### 🐍 ClaudeHydra CLI (Standard)
```bash
Komenda: pnpm start
Logging: INFO level (podstawowe informacje)
```

**Pokazuje:**
- Banner ClaudeHydra
- Wybrany agent
- Odpowiedź AI

---

### 🔍 ClaudeHydra CLI (Verbose)
```bash
Komenda: pnpm start --verbose
Logging: DEBUG level (szczegółowe logi)
```

**Pokazuje:**
- [DEBUG] 🤖 Selected: Jaskier - Auto-selected (score: 2.50)
- [DEBUG] Processing query { agent, model, temperature }
- [DEBUG] Ollama → /api/generate { model, tokens, penalties }
- [TRACE] Ollama ← /api/generate { tokens_generated, duration_ms }
- [INFO]  Query completed in 1234ms

**Idealne do:**
- Debugowania repetycji
- Sprawdzania jakie parametry idą do Ollama
- Diagnozowania problemów z MCP
- Rozumienia jak działa agent routing

---

## Różnica w Output

### Standard Mode:
```
╔══════════════════════════════════════╗
║   ClaudeHydra CLI v3.0.0   ║
╚══════════════════════════════════════╝

🐍 Gotowy do pracy.

HYDRA> podaj swój pipeline z modelami ai

ClaudeHydra używa Ollama (qwen3:4b) lokalnie + Anthropic API.
Pipeline: QueryProcessor → AgentRouter → LlamaCppBridge → Ollama.

HYDRA>
```

### Verbose Mode:
```
╔══════════════════════════════════════╗
║   ClaudeHydra CLI v3.0.0   ║
╚══════════════════════════════════════╝

[INFO]  Verbose mode enabled (DEBUG level)
🐍 Gotowy do pracy.

HYDRA> podaj swój pipeline z modelami ai

[DEBUG] 🤖 Selected: Jaskier - Auto-selected (score: 2.50)
        topScores: ["Jaskier:2.5", "Vesemir:1.0"]
[DEBUG] Processing query {
  agent: 'Jaskier',
  model: 'qwen3:4b',
  temperature: 0.8
}
[DEBUG] Ollama → /api/generate {
  model: 'qwen3:4b',
  tokens: 150,
  penalties: { repeat: 1.5, frequency: 1.2 }
}
[INFO]  Query completed in 1267ms

ClaudeHydra używa Ollama (qwen3:4b) lokalnie + Anthropic API.
Pipeline: QueryProcessor → AgentRouter → LlamaCppBridge → Ollama.

HYDRA>
```

---

## Troubleshooting

**Problem:** Skrót nie działa / CMD otwiera się i zamyka
**Rozwiązanie:**
1. Prawy klik na skrót → Properties
2. Sprawdź "Working directory" = ścieżka do projektu
3. Sprawdź czy `pnpm` jest zainstalowany: `pnpm --version`

**Problem:** Brak uprawnień do utworzenia skrótu
**Rozwiązanie:**
```powershell
# PowerShell jako Administrator:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## Dokumentacja

Pełna dokumentacja: [docs/DESKTOP-SHORTCUT.md](docs/DESKTOP-SHORTCUT.md)
Debug logging guide: [docs/DEBUG-LOGGING.md](docs/DEBUG-LOGGING.md)
