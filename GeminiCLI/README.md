# HYDRA Ollama MCP Server

Lekki serwer MCP do integracji z Ollama i Gemini CLI, z kolejką zadań, cache i optymalizacją promptów.

## Szybki start

```bash
pnpm install
pnpm start
```

Lub z launcherem (status line, auto-resume, YOLO):

```bash
npm run launcher
```

## Konfiguracja

Skopiuj `.env.example` do `.env` i ustaw wartości według potrzeb.

Najważniejsze zmienne:

- `OLLAMA_HOST`
- `DEFAULT_MODEL`, `FAST_MODEL`, `CODER_MODEL`
- `CACHE_ENCRYPTION_KEY` (AES-256-GCM, 32 bajty)
- `HYDRA_YOLO` (true/false)
- `HYDRA_RISK_BLOCKING` (true/false)

## Narzędzia MCP

Serwer udostępnia m.in.:

- `ollama_generate`, `ollama_smart`, `ollama_speculative`
- `ollama_status`, `ollama_cache_clear`
- `hydra_swarm` (6-step AgentSwarm z 12 agentami)
- `hydra_health`, `hydra_config`

## Logowanie

Logi w produkcji są w JSON, sterowane przez `LOG_LEVEL`.
Swarm archiwizuje sesje w `.serena/memories`.
