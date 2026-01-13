# CHANGELOG

## Unreleased
- Rozszerzono `mcp-health-check.ps1` o logowanie JSON, retry, eksport wyników i opcjonalny auto-restart.
- Dodano obsługę nadpisania katalogu projektu przez `CLAUDECLI_ROOT`.
- Skrypt zawsze inicjalizuje AI Handler przy starcie.
- Dodano szyfrowanie AES-256 dla stanu AI i kolejki oraz logi JSON.
- Rozszerzono obsługę providerów (Google, Mistral, Groq) i fallback chain.
- Dodano dashboard zdrowia AI (`Invoke-AIHealth.ps1`) oraz konfigurację MCP w `mcp-servers.json`.
