# ARCHITECTURE

## Overview
Projekt to zestaw skryptów PowerShell do zarządzania środowiskiem ClaudeCLI oraz narzędzi MCP.

## Kluczowe komponenty
- `mcp-health-check.ps1`: równoległe sprawdzanie dostępności serwerów MCP z logowaniem i eksportem wyników.
- `ai-handler/Initialize-AIHandler.ps1`: zawsze inicjalizowany przy starcie narzędzi, zapewnia fallback modeli i logowanie.
- `ai-handler/`: moduły obsługi modeli AI.
- `parallel/`: narzędzia do wykonywania zadań równolegle.

## Konwencje
- Logowanie: poziomy `debug/info/warn/error`, opcjonalny format JSON.
- Konfiguracja: zmienne środowiskowe (np. `CLAUDECLI_ROOT`).
- Bezpieczeństwo: brak kluczy w repozytorium, tylko ENV.
