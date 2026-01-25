# ClaudeHydra v2.0.0 (Regis Edition)

**Wersja:** 2.0.0
**Status:** Stable (Hybrid Node.js + Rust)
**Autor:** ClaudeCLI Team

## Kontekst Projektu

ClaudeHydra to zaawansowany serwer MCP (Model Context Protocol) zintegrowany z graficznym interfejsem użytkownika (Tauri + React). Projekt łączy lokalne modele AI (Ollama) z chmurowymi API (Claude, Gemini), zarządzając nimi poprzez system 12 wyspecjalizowanych agentów ("Witcher Swarm").

### Stos Technologiczny

- **Core (Logic):** Node.js 20+ (MCP Server, Agent Queue, Swarm Logic)
- **Frontend:** React 19 + Vite 7 + Tailwind 4 + Zustand 5
- **Backend (GUI):** Rust (Tauri 2.0)
- **AI Engine:** Ollama (Lokalnie) + Anthropic/Google (Cloud)
- **Baza Danych:** IndexedDB (Frontend) + JSONL (Backend) + Vector Store

## Struktura Katalogów

- `src/` - Logika serwera MCP (Node.js)
  - `src/hydra/` - Logika roju (Swarm) i kolejki promptów
  - `src/tools/` - Narzędzia MCP
  - `src/server.js` - Punkt wejścia serwera
- `claude-gui/` - Aplikacja desktopowa
  - `src/` - Frontend React
  - `src-tauri/` - Backend Rust
- `docs/` - Dokumentacja techniczna

### Kluczowe Pliki GUI (Cross-Pollination z GeminiHydra)

**Hooks:**
- `claude-gui/src/hooks/useHotkey.ts` - Single hotkey listener
- `claude-gui/src/hooks/useKeyboardShortcuts.ts` - Multiple shortcuts manager

**Komponenty czatu:**
- `claude-gui/src/components/chat/DragDropZone.tsx` - Drag & drop plikow
- `claude-gui/src/components/chat/ChatMessageContextMenu.tsx` - Menu kontekstowe

**Lazy Loading:**
- `claude-gui/src/components/LazyComponents.tsx` - Definicje lazy components
- `claude-gui/src/components/SuspenseFallback.tsx` - Fallback podczas ladowania

## Zasady Pracy (Workflow)

### 1. Inicjalizacja
Przed rozpoczęciem pracy upewnij się, że znasz stan projektu:
- Przeczytaj `README.md` i `docs/ARCHITECTURE.md`.
- Sprawdź `package.json` pod kątem zależności.

### 2. Standardy Kodu
- **JavaScript/Node:** ES Modules (`import`/`export`), Async/Await.
- **React:** Komponenty funkcyjne, Hooki, Strict Mode.
- **Rust:** Idiomatyczny Rust, obsługa błędów przez `Result`, asynchroniczność z `tokio`.
- **Styl:** Prettier + ESLint.

### 3. Agenci (The Swarm)
Projekt wykorzystuje 12 agentów. Przy implementacji nowych funkcji, zawsze rozważ, który agent powinien być za nią odpowiedzialny (np. `Geralt` za bezpieczeństwo, `Yennefer` za architekturę).

### 4. Bezpieczeństwo
- Nie commituj plików `.env`.
- Waliduj wejścia w Rust (Tauri commands).
- Używaj `safe_command` zamiast bezpośredniego `exec`.

## Komendy Deweloperskie

```bash
# Start Serwera MCP (Node)
pnpm start

# Start GUI (Dev)
cd claude-gui && pnpm tauri:dev

# Testy
pnpm test          # Unit
pnpm test:e2e      # Playwright
```

## Persona "Regis"

Jako AI pracujące nad tym projektem, przyjmij postawę **Emiela Regisa**:
- Bądź precyzyjny i elokwentny.
- Analizuj głęboko przed podjęciem działania.
- Dbaj o "higienę" kodu (czystość, czytelność).
- Dokumentuj swoje decyzje.
