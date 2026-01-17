# Architektura

## Moduły

- `src/server.js` – główny serwer MCP i routing narzędzi.
- `src/tools.js` – definicje narzędzi MCP.
- `src/config.js` – konfiguracja z ENV.
- `src/logger.js` – logger z poziomami i JSON w produkcji.
- `src/cache.js` – cache z szyfrowaniem AES-256-GCM.
- `src/swarm.js` – 6-step AgentSwarm (12 agentów) i orkiestracja.
- `src/memory.js` – zapis archiwów i task-logów do `.serena/memories`.

## Przepływ

1. Serwer ładuje konfigurację i wersję.
2. Inicjalizuje kolejkę i cache.
3. Obsługuje wywołania narzędzi z walidacją wejścia.
4. Dla złożonych zadań uruchamia Swarm i zapisuje archiwum.
