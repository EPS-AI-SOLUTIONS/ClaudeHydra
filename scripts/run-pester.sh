#!/usr/bin/env bash
set -euo pipefail

if command -v pwsh >/dev/null 2>&1; then
  pwsh -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"
  exit 0
fi

if command -v powershell >/dev/null 2>&1; then
  powershell -NoProfile -Command "Invoke-Pester -Path tests -Output Detailed"
  exit 0
fi

echo "PowerShell not found. Run ./scripts/install-powershell.sh or install pwsh (PowerShell 7+)." >&2
exit 1
