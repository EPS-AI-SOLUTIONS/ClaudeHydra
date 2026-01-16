# Changelog

## [3.0.0] - 2026-01-14

### Added
- **12 Witcher Agents**: Expanded from 4 to 12 specialized agents (Geralt, Yennefer, Triss, Jaskier, Vesemir, Ciri, Eskel, Lambert, Zoltan, Regis, Dijkstra, Philippa)
- **Parallel Execution**: `Invoke-ParallelSwarmExecution` using RunspacePool for concurrent agent execution
- **Agent Model Mapping**: `$script:AgentModels` with specialized Ollama models per agent
- **New Functions**: `Get-AgentModel`, `Invoke-ParallelSwarmExecution`
- **16 Exported Functions**: Combined from AgentSwarm + SmartQueue

### Changed
- **Unified Module**: Merged `SmartQueue.psm1` into `AgentSwarm.psm1` (287 → 1305 lines)
- **6-Step Protocol**: Now uses parallel execution in Step 3 (was sequential foreach)
- **Planner Prompt**: Updated to include all 12 agents with specializations
- **Performance**: 50-75% faster execution for multi-agent tasks

### Removed
- **SmartQueue.psm1**: Deleted (functionality merged into AgentSwarm.psm1)

### Fixed
- Sequential bottleneck in Step 3 execution
- Memory functions moved to module scope (were nested functions)

---

## [2.0.0] - 2026-01-13

### Added
- Konfiguracja, logger i narzędzia diagnostyczne
- Szyfrowanie cache (AES-256-GCM)
- Walidacja ENV, obsługa dotenv i schematów narzędzi
- Limity rozmiaru cache i cykliczne sprzątanie
- Retry/timeout dla pobierania modeli Gemini
- Limity długości promptów i obsługa allowlist/denylist modeli
- Opcjonalna persystencja kolejki
- SmartQueue.psm1 z parallel execution via RunspacePool

### Changed
- Przeniesiono definicje narzędzi do osobnego modułu
- AI handler jako domyślny handler kolejki przy starcie

---

## [1.0.0] - Initial Release

### Added
- 4-Step Swarm Protocol (Speculate, Plan, Execute, Synthesize)
- 4 Witcher Agents (Geralt, Yennefer, Triss, Jaskier)
- Agent memory system (.serena/memories/)
- MCP integration (Serena, Desktop Commander, Playwright)
- Multi-provider failover (Google, Anthropic, OpenAI, Ollama)
- YOLO mode for fast execution
