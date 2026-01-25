# Kontrybucja do ClaudeHydra

Dziękujemy za zainteresowanie projektem! Poniżej znajdują się zasady współpracy.

## Standardy Techniczne

### 1. Node.js (MCP Server)
- Używamy **ES Modules** (`import`/`export`).
- Kod musi być zgodny z Node.js v20+.
- Logika agentów w `src/hydra/`.

### 2. Rust (Tauri Backend)
- Formatowanie: `cargo fmt`.
- Linting: `cargo clippy`.
- Obsługa błędów: Zawsze używaj `Result` i propaguj błędy (operator `?`).
- Nie używaj `unwrap()` w kodzie produkcyjnym (z wyjątkiem testów i `main.rs`).

### 3. Frontend (React)
- Komponenty w `claude-gui/src/components`.
- Używaj hooków (`useQuery`, custom hooks) do logiki.
- Stylowanie tylko przez TailwindCSS.

## Proces PR (Pull Request)

1. **Fork** repozytorium.
2. Utwórz branch tematyczny: `feature/nowy-agent` lub `fix/blad-kolejki`.
3. Dodaj testy (jeśli dotyczy logiki).
4. Upewnij się, że przechodzą `pnpm test` i `pnpm e2e`.
5. Utwórz PR z opisem zmian.

## Dodawanie Nowych Agentów

Aby dodać nowego agenta do Roju:
1. Zdefiniuj rolę i model w `src/hydra/constants.js`.
2. Opisz agenta w `docs/AGENTS.md`.
3. Zaimplementuj specyficzną logikę (jeśli potrzebna) w `src/hydra/agents/`.

## Zgłaszanie Błędów

Używaj GitHub Issues. Podaj:
- Wersję OS.
- Wersję Node.js i Rust.
- Kroki do reprodukcji.
- Logi (jeśli dostępne).

Dziękujemy!
~ Zespół ClaudeCLI
