#!/usr/bin/env bash
set -euo pipefail

if command -v pwsh >/dev/null 2>&1; then
  echo "pwsh already installed: $(command -v pwsh)"
  exit 0
fi

case "$(uname -s)" in
  Linux)
    cat <<'MESSAGE'
PowerShell is not installed.

Install options:
  - Debian/Ubuntu: https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-linux
  - Fedora/RHEL:   https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-linux
  - Alpine:        https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-linux

After installation, re-run:
  ./scripts/run-pester.sh
MESSAGE
    ;;
  Darwin)
    cat <<'MESSAGE'
PowerShell is not installed.

Install via Homebrew:
  brew install --cask powershell

After installation, re-run:
  ./scripts/run-pester.sh
MESSAGE
    ;;
  *)
    echo "PowerShell is not installed. See: https://learn.microsoft.com/powershell/scripting/install/installing-powershell" >&2
    ;;
esac

exit 1
