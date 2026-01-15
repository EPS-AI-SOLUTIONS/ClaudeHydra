#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-Dev}"

if ! command -v pwsh >/dev/null 2>&1; then
  echo "PowerShell (pwsh) not found. Install PowerShell 7+ to run the launcher."
  echo "https://learn.microsoft.com/powershell/"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec pwsh -File "${ROOT_DIR}/_launcher.ps1" -Profile "${PROFILE}"
