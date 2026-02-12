# ClaudeHydra v3.0.0 (Regis Edition)

**Wersja:** 3.0.0
**Status:** Stable (Web-Only — Next.js + Hono)
**Autor:** ClaudeCLI Team

## Kontekst Projektu

ClaudeHydra to zaawansowany serwer MCP (Model Context Protocol) z webowym interfejsem użytkownika. Projekt łączy lokalne modele AI (Ollama) z chmurowymi API (Claude, Gemini), zarządzając nimi poprzez system 12 wyspecjalizowanych agentów ("Witcher Swarm"). Deployowany na Vercel.

### Stos Technologiczny

- **Core (Logic):** Node.js 20+ (MCP Server, Agent Queue, Swarm Logic)
- **Frontend:** React 19 + Next.js 16 + Tailwind 4 + Zustand 5 + Framer Motion 12
- **API Layer:** Hono 4 (catch-all route, modular)
- **AI Engine:** Ollama (Lokalnie) + Anthropic/Google (Cloud)
- **Storage:** Upstash Redis (KV) + Vercel Blob (pliki RAG/training)
- **Deploy:** Vercel (Frankfurt — fra1)

### Migracja v2 → v3

- Usunięto `claude-gui/` (Tauri desktop) i `src/gui/` (prototyp)
- SQLite → Upstash Redis (z in-memory fallback dla local dev)
- 26 Next.js Route Handlers → 1 Hono catch-all (`/api/[...route]`)
- Dodano Vercel Blob dla dużych plików (RAG, training, vectors)

## Struktura Katalogów

- `src/` - Logika serwera MCP (Node.js)
  - `src/hydra/` - Logika roju (Swarm) i kolejki promptów
  - `src/tools/` - Narzędzia MCP
  - `src/server.ts` - Punkt wejścia serwera
- `web/` - Aplikacja webowa (Next.js 16)
  - `web/src/api/` - Hono route modules (chats, ollama, bridge, memory, learning, debug, claude, anthropic, system)
  - `web/src/api/middleware/` - Error handler, validation
  - `web/src/api/index.ts` - Główna aplikacja Hono z basePath('/api')
  - `web/src/app/` - Next.js App Router (pages)
  - `web/src/app/api/[...route]/route.ts` - Catch-all → Hono
  - `web/src/lib/` - Shared utilities (kv, blob, db-shim, api-client, event-bus)
  - `web/src/components/` - React components
- `docs/` - Dokumentacja techniczna

### Kluczowe Pliki API

| Moduł | Ścieżka | Endpointy |
|---|---|---|
| Chats | `web/src/api/chats.ts` | CRUD sesji + wiadomości |
| Ollama | `web/src/api/ollama.ts` | health, models, generate, chat (NDJSON stream) |
| Bridge | `web/src/api/bridge.ts` | state, approve, reject, clear |
| Memory | `web/src/api/memory.ts` | agent memories + knowledge graph |
| Learning | `web/src/api/learning.ts` | stats, preferences, training, RAG |
| Debug | `web/src/api/debug.ts` | stats, logs, snapshot, SSE stream |
| Claude | `web/src/api/claude.ts` | SSE events, history CRUD, rules CRUD |
| Anthropic | `web/src/api/anthropic.ts` | static model list |
| System | `web/src/api/system.ts` | CPU/memory info |

## Zasady Pracy (Workflow)

### 1. Inicjalizacja
Przed rozpoczęciem pracy upewnij się, że znasz stan projektu:
- Przeczytaj `README.md` i `docs/ARCHITECTURE.md`.
- Sprawdź `web/package.json` pod kątem zależności.
- Skopiuj `web/.env.example` → `web/.env.local` i uzupełnij klucze.

### 2. Standardy Kodu
- **TypeScript:** Strict mode, ES2022 target.
- **React:** Komponenty funkcyjne, Hooki, Strict Mode.
- **API:** Hono routes, Zod validation, KV_KEYS namespace.
- **Styl:** Biome (lint + format).

### 3. Agenci (The Swarm)
Projekt wykorzystuje 12 agentów. Przy implementacji nowych funkcji, zawsze rozważ, który agent powinien być za nią odpowiedzialny (np. `Geralt` za bezpieczeństwo, `Yennefer` za architekturę).

### 4. Bezpieczeństwo
- Nie commituj plików `.env`.
- Waliduj wejścia przez Zod schemas (`@hono/zod-validator`).
- Używaj `safe_command` zamiast bezpośredniego `exec`.

## Komendy Deweloperskie

```bash
# Start Web (Dev)
cd web && npm run dev

# Build
cd web && npx next build

# Start Serwera MCP (Node)
pnpm start

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
