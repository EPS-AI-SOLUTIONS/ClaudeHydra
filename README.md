# ClaudeHydra: AI Swarm Control Center

> *"Postęp jest jak stado świń. Z faktu, że jest głośny, wcale nie wynika, że idzie w dobrym kierunku. My nadajemy mu kierunek."* — Dijkstra

![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Stack](https://img.shields.io/badge/stack-Tauri_2%2BReact_19%2BNode_MCP-purple)

**ClaudeHydra** to hybrydowa platforma orkiestracji AI, łącząca moc lokalnych modeli (Ollama) z inteligencją chmury (Claude/Gemini) poprzez protokół MCP. Sercem systemu jest "Rój" (Swarm) - 12 wyspecjalizowanych agentów inspirowanych postaciami z Wiedźmina.

---

## 🚀 Możliwości

- **Multi-Agent Swarm**: 12 agentów pracujących równolegle (Geralt, Yennefer, Triss...).
- **Hybrid Core**:
  - **Node.js**: Serwer MCP, zarządzanie kolejką promptów, logika biznesowa.
  - **Rust/Tauri**: Wydajny backend desktopowy, operacje systemowe, bezpieczeństwo.
- **Smart Queue**: Priorytetowa kolejka zadań z rate-limitingiem i retry policy.
- **Alzur Trainer**: Moduł uczenia i finetuningu modeli lokalnych.
- **Matrix Glass UI**: Nowoczesny interfejs w React 19 + Tailwind 4.

### Nowe w v2.0.0 (Cross-Pollination z GeminiHydra)

- **DragDropZone**: Przeciaganie plikow (obrazy, tekst) bezposrednio do czatu.
- **ChatMessageContextMenu**: Menu kontekstowe z kopiowaniem, regeneracja i usuwaniem wiadomosci.
- **Keyboard Shortcuts**:
  - `useHotkey` - hook do pojedynczych skrotow klawiszowych.
  - `useKeyboardShortcuts` - manager wielu skrotow z dynamiczna rejestracja.
- **TanStack Query**: Server-state management z automatycznym cachowaniem (staleTime: 5min).
- **Sonner Toast**: Eleganckie powiadomienia w stylu Matrix Glass.
- **Lazy Loading**: Wszystkie widoki ladowane dynamicznie (React.lazy + Suspense).

---

## 🛠️ Instalacja

### Wymagania
- Node.js 20+
- Rust (latest stable)
- Ollama (zainstalowana i uruchomiona)
- pnpm

### Setup

1. **Klonowanie i instalacja zależności:**
   ```bash
   git clone https://github.com/your-repo/ClaudeHydra.git
   cd ClaudeHydra
   pnpm install
   cd claude-gui
   pnpm install
   ```

2. **Konfiguracja środowiska:**
   Skopiuj `.env.example` do `.env` w głównym katalogu:
   ```env
   OLLAMA_HOST=http://localhost:11434
   ANTHROPIC_API_KEY=sk-...
   GOOGLE_API_KEY=AIza...
   ```

3. **Uruchomienie (Dev Mode):**
   ```bash
   # W katalogu claude-gui
   pnpm tauri:dev
   ```

---

## 🧙‍♂️ Rój Agentów (The Swarm)

System deleguje zadania do agentów na podstawie ich specjalizacji:

| Agent | Rola | Model (Domyślny) |
|-------|------|------------------|
| **Geralt** | Security & Coordinator | llama3.2:3b |
| **Yennefer** | Architect & Design | phi3:mini |
| **Triss** | QA & Testing | qwen2.5-coder |
| **Jaskier** | Documentation | llama3.2:3b |
| **Vesemir** | Code Review | phi3:mini |
| **Ciri** | Performance (Speed) | llama3.2:1b |
| **Dijkstra** | Strategic Planner | llama3.2:3b |
| ...i inni | (szczegóły w docs/AGENTS.md) | |

---

## 🏗️ Architektura

Dokumentacja techniczna znajduje się w katalogu `docs/`:
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Diagramy i opis warstw.
- [AGENTS.md](docs/AGENTS.md) - Szczegółowy opis agentów.
- [MCP.md](docs/MCP.md) - Specyfikacja narzędzi Model Context Protocol.

---

## 🤝 Kontrybucje

Zapraszamy do współpracy! Zapoznaj się z `CONTRIBUTING.md` przed wysłaniem PR.

**Licencja:** MIT
**Autor:** ClaudeCLI Team
