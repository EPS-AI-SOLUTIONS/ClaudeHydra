# Architektura ClaudeHydra

**Wersja:** 2.0.0 (Regis)

System ClaudeHydra opiera się na architekturze hybrydowej, łączącej elastyczność Node.js (logika agentów) z wydajnością Rust (operacje systemowe) i nowoczesnym frontendem React.

## Diagram Wysokopoziomowy

```mermaid
graph TD
    User[Użytkownik] <--> GUI[Claude GUI (Tauri/React)]
    
    subgraph "Desktop App (Tauri)"
        GUI <-->|IPC Commands| Rust[Rust Backend]
        Rust <-->|FS/Sys| OS[System Operacyjny]
        Rust <-->|Bridge| MCPServer[Node.js MCP Server]
    end

    subgraph "Brain (Node.js)"
        MCPServer --> Queue[Prompt Queue Manager]
        Queue --> Agents[12 Agent Swarm]
        Agents --> Tools[MCP Tools]
    end

    subgraph "AI Providers"
        Agents <-->|HTTP| Ollama[Local Ollama]
        Agents <-->|HTTP| Cloud[Anthropic/Google API]
    end
```

## Komponenty

### 1. Node.js MCP Server (`src/`)
To "mózg" operacyjny.
- **Odpowiedzialność:** Logika biznesowa, zarządzanie agentami, kolejkowanie zadań, integracja z narzędziami MCP.
- **Kluczowe moduły:**
  - `prompt-queue.js`: Implementacja priorytetowej kolejki i rate-limitera.
  - `hydra/`: Logika specyficzna dla agentów Wiedźmina.
  - `tools/`: Implementacja narzędzi (filesystem, git, search).

### 2. Rust Backend (`claude-gui/src-tauri/`)
To "mięśnie" i warstwa integracji z systemem.
- **Odpowiedzialność:** Zarządzanie oknami, bezpieczne operacje na plikach, uruchamianie procesu Node.js, obsługa menu kontekstowego.
- **Kluczowe moduły:**
  - `commands.rs`: API dostępne dla frontendu.
  - `bridge.rs`: Komunikacja z procesem Node.js.
  - `ollama.rs`: Bezpośrednia, szybka komunikacja z Ollama dla streamingu chatu.

### 3. Frontend (`claude-gui/src/`)
Warstwa prezentacji.
- **Technologia:** React 19, Vite, Tailwind 4.
- **Stan:** Zustand (global state).
- **Design:** Matrix Glass (inspirowany terminalami sci-fi).

## Przepływ Danych (Data Flow)

1. **Użytkownik** wpisuje prompt w GUI.
2. **React** wysyła komendę IPC do **Rust**.
3. **Rust** przekazuje zadanie do **Node.js MCP Server** (jeśli wymaga logiki agentów) LUB bezpośrednio do **Ollama** (prosty chat).
4. **Node.js** analizuje prompt, wybiera agenta (np. Triss do testów) i kolejkuje zadanie.
5. **Agent** wykonuje narzędzia (np. `read_file`, `exec_command`) i zwraca wynik.
6. Wynik wraca przez **Rust** do **React**.

## Bezpieczeństwo

- **Izolacja:** Proces Node.js działa jako proces potomny, ale komunikacja jest ściśle kontrolowana.
- **Walidacja:** Wszystkie ścieżki plików są walidowane w Rust przed dostępem.
- **API Keys:** Przechowywane w pamięci procesu backendu, nie eksponowane do frontendu (poza niezbędnymi wyjątkami).

---

## GUI: Architektura Lazy Loading

Frontend wykorzystuje React 19 z wzorcem lazy loading dla optymalnej wydajnosci. Wszystkie ciezkie komponenty sa ladowane dynamicznie.

### Lazy Components (`claude-gui/src/components/LazyComponents.tsx`)

```
                      ┌─────────────────────┐
                      │     App.tsx         │
                      │  (QueryClient +     │
                      │   Sonner Toaster)   │
                      └──────────┬──────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
     ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
     │ <Suspense>     │ │ <Suspense>     │ │ <Suspense>     │
     │  SidebarLazy   │ │ OllamaChatView │ │ SettingsView   │
     └────────────────┘ │    Lazy        │ │    Lazy        │
                        └────────────────┘ └────────────────┘
```

**Ladowane leniwie:**
- `SettingsViewLazy` - Zarzadzanie kluczami API
- `SidebarLazy` - Nawigacja i sesje
- `OllamaChatViewLazy` - Czat z renderowaniem Markdown
- `ChatHistoryViewLazy` - Historia rozmow
- `HistoryViewLazy` - Historia zatwierdzen
- `RulesViewLazy` - Edytor regul auto-approve
- `LearningPanelLazy` - Panel uczenia AI
- `DebugPanelLazy` - Narzedzia debugowania

### Warstwa Hooks (`claude-gui/src/hooks/`)

Hooki zapewniaja reuzywalna logike biznesowa:

| Hook | Funkcja | Zrodlo |
|------|---------|--------|
| `useHotkey` | Pojedynczy skrot klawiszowy | GeminiHydra |
| `useKeyboardShortcuts` | Manager wielu skrotow | GeminiHydra |
| `useClaude` | Integracja z Claude API | Native |
| `useChatHistory` | Persystencja czatow (IndexedDB) | Native |
| `useSessionAI` | Stan sesji AI | Native |
| `useWorker` | Web Worker communication | Native |
| `useResearchAgent` | Agent badawczy | Native |
| `useTrainingAgent` | Agent treningu modeli | Native |
| `usePromptPipeline` | 6-etapowy pipeline promptow | Native |

### Cross-Pollination Components (z GeminiHydra)

Komponenty przeniesione z siostrzanego projektu GeminiHydra:

**`DragDropZone`** (`claude-gui/src/components/chat/DragDropZone.tsx`)
- Obsluga drag & drop plikow do czatu
- Walidacja rozmiaru (domyslnie max 5MB)
- Rozpoznawanie typow: obrazy (base64) vs tekst

**`ChatMessageContextMenu`** (`claude-gui/src/components/chat/ChatMessageContextMenu.tsx`)
- Menu kontekstowe dla wiadomosci czatu
- Akcje: Kopiuj, Regeneruj (tylko AI), Usun
- Automatyczne zamykanie przy kliknieciu poza menu

### TanStack Query Integration

Konfiguracja w `claude-gui/src/main.tsx`:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minut
      refetchOnWindowFocus: false,
    },
  },
});
```

### Sonner Toast Notifications

Globalny system powiadomien w stylu Matrix Glass:

```typescript
<Toaster
  position="bottom-right"
  toastOptions={{
    style: {
      background: '#0a1f0a',
      border: '1px solid rgba(0, 255, 65, 0.3)',
      color: '#c0ffc0',
    },
  }}
/>
```
