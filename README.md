# HYDRA 10.0 - ClaudeCLI

[![GitHub stars](https://img.shields.io/github/stars/pawelserkowski-lang/ClaudeCLI?style=flat-square)](https://github.com/pawelserkowski-lang/ClaudeCLI/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/pawelserkowski-lang/ClaudeCLI?style=flat-square)](https://github.com/pawelserkowski-lang/ClaudeCLI/network/members)
[![GitHub issues](https://img.shields.io/github/issues/pawelserkowski-lang/ClaudeCLI?style=flat-square)](https://github.com/pawelserkowski-lang/ClaudeCLI/issues)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![PowerShell](https://img.shields.io/badge/PowerShell-7.0+-5391FE?style=flat-square&logo=powershell&logoColor=white)](https://github.com/PowerShell/PowerShell)
[![Windows](https://img.shields.io/badge/Windows-11-0078D6?style=flat-square&logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![Ollama](https://img.shields.io/badge/Ollama-Local_AI-000000?style=flat-square)](https://ollama.ai)
[![Claude](https://img.shields.io/badge/Claude-Anthropic-CC785C?style=flat-square)](https://anthropic.com)

**Maximum Autonomy Mode** | **Parallel Execution** | **MCP Orchestration** | **Advanced AI**

```
 _   ___   ______  ____   ___
| | | \ \ / /  _ \|  _ \ / \ \
| |_| |\ V /| | | | |_) / _ \ \
|  _  | | | | |_| |  _ / ___ \ \
|_| |_| |_| |____/|_| /_/   \_\_\

Three Heads, One Goal. Hydra Executes In Parallel.
```

## 🎯 Overview

HYDRA 10.0 to zaawansowane środowisko dla **Claude CLI** działające w trybie **Maximum Autonomy Mode** z pełnym dostępem do:
- Zmiennych środowiskowych (read/write/delete)
- Rejestru Windows (HKLM, HKCU)
- Systemu plików (pełen dostęp)
- Operacji sieciowych (firewall, port scanning)
- Instalacji oprogramowania (chocolatey, winget, npm, pip)

## 📋 Features

### ✨ Maximum Autonomy Mode
- 🔓 **Wildcard permissions**: `Bash(*)`, `Write(*)`, `Edit(*)`, `Read(*)`
- 🔧 **Rejestr Windows**: Pełny R/W dostęp
- 🔐 **Uprawnienia admin**: RunAs, zarządzanie usługami
- 📂 **System plików**: Dostęp do System32, Program Files
- 🌐 **Operacje sieciowe**: Port scanning, firewall rules
- 📦 **Instalacja software**: choco, winget, npm global, pip
- ⚡ **Wykonywanie skryptów**: Unrestricted Execution Policy

### ⚡ Parallel Execution
- Wszystkie niezależne operacje wykonywane równolegle
- PowerShell Jobs dla MCP health checks
- Zgodność z zasadą: *"Każda operacja, która może być wykonana równolegle, MUSI być wykonana równolegle"*

### 🧠 Advanced AI System (5 Modules)

| Module | Description | Key Feature |
|--------|-------------|-------------|
| **Self-Correction** | Auto-validates code with phi3:mini | Regenerates on syntax errors |
| **Few-Shot Learning** | Learns from successful responses | Context-aware examples |
| **Speculative Decoding** | Parallel multi-model generation | Model racing & consensus |
| **Load Balancing** | CPU-aware provider switching | Auto local/cloud selection |
| **Semantic File Mapping** | Deep RAG with import analysis | Dependency graph context |

```powershell
# Quick AI commands
Invoke-AdvancedAI "Write Python sort" -Mode code    # Self-correction + few-shot
Get-AIQuick "Capital of France?"                     # Model racing (~2s)
New-AICode "Download file function"                  # Code with validation
Invoke-SemanticQuery -FilePath "app.py" -Query "How does auth work?"
```

### 📊 AI Health Dashboard
- Podgląd stanu providerów, tokenów i kosztów
- Tryb JSON do integracji z monitoringiem

```powershell
.\ai-handler\Invoke-AIHealth.ps1
.\ai-handler\Invoke-AIHealth.ps1 -Json
```

### 🔐 Szyfrowanie danych
- Stan AI i kolejki są szyfrowane AES-256
- Klucz: `CLAUDECLI_ENCRYPTION_KEY` w zmiennych środowiskowych

### 🛠️ MCP Tools Integration
| Tool | Port | Transport | Funkcja |
|------|------|-----------|---------|
| **Serena** | 9000 | SSE | Symbolic code analysis |
| **Desktop Commander** | 8100 | Stdio | System operations |
| **Playwright** | 5200 | Stdio | Browser automation |

## 📦 Installation

### Prerequisites
- Windows 11
- PowerShell 7+ (pełne funkcje: streaming, równoległość); 5.1 działa dla podstawowych komend
- Claude CLI
- API Key: `ANTHROPIC_API_KEY`
- Encryption Key: `CLAUDECLI_ENCRYPTION_KEY`

### Quick Start

```powershell
# 1. Clone or download projekt do Desktop\ClaudeCLI

# 2. Ustaw API Key
[Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', 'sk-ant-api03-...', 'User')
[Environment]::SetEnvironmentVariable('OPENAI_API_KEY', 'sk-...', 'User')
[Environment]::SetEnvironmentVariable('GOOGLE_API_KEY', '...', 'User')
[Environment]::SetEnvironmentVariable('MISTRAL_API_KEY', '...', 'User')
[Environment]::SetEnvironmentVariable('GROQ_API_KEY', '...', 'User')
[Environment]::SetEnvironmentVariable('CLAUDECLI_ENCRYPTION_KEY', '...', 'User')

# 3. Uruchom launcher
.\ClaudeCLI.vbs
# LUB
powershell -ExecutionPolicy Bypass -File _launcher.ps1

# 4. (Opcjonalnie) Utwórz shortcut na pulpicie
.\create-shortcuts.ps1
```

## 🗂️ Project Structure

```
C:\Users\BIURODOM\Desktop\ClaudeCLI\
├── .claude/
│   ├── commands/            # Custom slash commands (ai, ai-batch, ai-config...)
│   ├── hooks/               # Event hooks
│   ├── skills/              # Custom skills (serena-commander, hydra)
│   └── statusline.js        # Status bar config
├── .serena/
│   └── project.yml          # Serena project config
├── ai-handler/              # 🤖 AI Model Handler
│   ├── AIModelHandler.psm1  # Main module
│   ├── ai-config.json       # Provider/model configuration
│   ├── Invoke-AIHealth.ps1  # Health dashboard
│   ├── modules/             # 🧠 Advanced AI Modules
│   │   ├── SelfCorrection.psm1
│   │   ├── FewShotLearning.psm1
│   │   ├── SpeculativeDecoding.psm1
│   │   ├── LoadBalancer.psm1
│   │   ├── SemanticFileMapping.psm1
│   │   └── AdvancedAI.psm1
│   └── *.ps1                # CLI wrappers & tests
├── parallel/                # ⚡ Parallel execution system
│   ├── modules/ParallelUtils.psm1
│   └── scripts/             # Git, Download, Compress, TaskDAG...
├── CLAUDE.md                # System instructions (900+ lines)
├── README.md                # This file
├── _launcher.ps1            # Main launcher
├── mcp-servers.json         # MCP server configuration
└── mcp-health-check.ps1     # MCP diagnostics
```

## 🔐 Security Policy

### Environment Variables Access
ClaudeCLI ma **pełny dostęp** do zmiennych środowiskowych:

```powershell
# ✅ DOZWOLONE: Odczyt
$apiKey = $env:ANTHROPIC_API_KEY

# ✅ DOZWOLONE: Modyfikacja (User/Machine/Process scopes)
[Environment]::SetEnvironmentVariable('NEW_VAR', 'value', 'User')

# ✅ DOZWOLONE: Usuwanie
[Environment]::SetEnvironmentVariable('OLD_VAR', $null, 'User')
```

### Permissions Model

```json
{
  "permissions": {
    "allow": [
      "Bash(*)",                    // WSZYSTKIE komendy Bash
      "mcp__serena__*",
      "mcp__desktop-commander__*",
      "mcp__playwright__*",
      "Write(*)", "Edit(*)", "Read(*)",
      "Glob(*)", "Grep(*)",
      "Skill(*)", "SlashCommand(*)"
    ],
    "deny": []                      // Pusta lista
  }
}
```

### 🚨 Absolutne zakazy (nawet w Maximum Autonomy):
- `rm -rf /` lub `Remove-Item C:\ -Recurse -Force`
- `format C:`
- `diskpart` bez potwierdzenia
- Masowe usuwanie kluczy rejestru
- Wyłączanie Windows Defender bez zgody

**Filozofia**: *Pełna moc, ale z odpowiedzialnością. Przed destrukcyjnymi operacjami - pytaj użytkownika!*

## 🚀 Usage

### Podstawowe uruchomienie

```powershell
# Via VBS launcher (zalecane)
.\ClaudeCLI.vbs

# Via PowerShell
powershell -ExecutionPolicy Bypass -File _launcher.ps1
```

### MCP Health Check

```powershell
# Ręczne sprawdzenie MCP servers (parallel execution)
.\mcp-health-check.ps1 -TimeoutSeconds 5

# Skrypt zawsze inicjalizuje AI Handler przy starcie (banner + dostępne modele)

# Przykłady rozszerzonych opcji
.\mcp-health-check.ps1 -Server Serena -HostName 127.0.0.1 -RetryCount 3
.\mcp-health-check.ps1 -Json -ExportJsonPath .\\logs\\health.json
.\mcp-health-check.ps1 -NoColor -ExportCsvPath .\\logs\\health.csv
.\mcp-health-check.ps1 -AutoRestart
```

### Konfiguracja MCP servers
- Edytuj `mcp-servers.json`, aby dodać/zmienić serwery MCP bez dotykania skryptu.

### Tworzenie skrótu na pulpicie

```powershell
.\create-shortcuts.ps1
```

## 🔧 Configuration

### API Keys Setup

```powershell
# PowerShell (User scope - rekomendowane)
[Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', 'sk-ant-api03-...', 'User')

# PowerShell (Process scope - tymczasowe)
$env:ANTHROPIC_API_KEY = "sk-ant-api03-..."

# CMD
setx ANTHROPIC_API_KEY "sk-ant-api03-..."
```

### Dodatkowa konfiguracja

```powershell
# (Opcjonalnie) Nadpisanie katalogu projektu
$env:CLAUDECLI_ROOT = "C:\\Users\\%USERNAME%\\Desktop\\ClaudeCLI"
```

### Weryfikacja

```powershell
# Lista zmiennych Claude/Anthropic
Get-ChildItem env: | Where-Object { $_.Name -like "*CLAUDE*" -or $_.Name -like "*ANTHROPIC*" }

# Sprawdź konkretną zmienną (maskowana)
$key = $env:ANTHROPIC_API_KEY
if ($key) { Write-Host "✓ API Key: $($key.Substring(0,15))..." }
```

## 📚 Architecture

### Council of Six (Multi-Agent Debate)

| Agent | Rola | Fokus |
|-------|------|-------|
| **Architekt** | Fakty | Rust 2024, React 19, czysta struktura |
| **Security** | Ryzyko | ENV vars allowed, zero commits wrażliwych danych, maskowanie kluczy API |
| **Speedster** | Performance | Lighthouse > 90, bundle < 200KB |
| **Pragmatyk** | Korzyści | Hybrydowość Web + Desktop |
| **Researcher** | Weryfikacja | Sprawdzaj w docs/Google przed implementacją |
| **Jester** | Emocje | Krytyka boilerplate'u i over-engineeringu |

### Parallel Execution Principle

```rust
// DOBRZE: tokio::join! dla niezależnych operacji
let (a, b, c) = tokio::join!(task_a(), task_b(), task_c());

// ŹLE: sekwencyjne await
let a = task_a().await;
let b = task_b().await;  // marnowanie czasu
```

```typescript
// DOBRZE: Promise.all
const [users, products] = await Promise.all([fetchUsers(), fetchProducts()]);

// ŹLE: await waterfall
const users = await fetchUsers();
const products = await fetchProducts();
```

## 🛡️ Best Practices

| Zalecenie | Priorytet |
|-----------|-----------|
| Używaj ENV vars zamiast hardcoded keys | 🔴 Krytyczny |
| NIE commituj kluczy API do Git | 🔴 Krytyczny |
| Maskuj klucze API w outputach (15 znaków) | 🟡 Średni |
| Preferuj absolute paths | 🟢 Niski |
| Zawsze używaj error handling (try/catch) | 🟡 Średni |
| Parallel MCP calls gdy możliwe | 🟡 Średni |
| Backupy przed systemowymi zmianami | 🟡 Średni |

## 📖 Documentation

Pełna dokumentacja systemowa: **[CLAUDE.md](CLAUDE.md)** (386 linii)

Zawiera:
- Parallel Execution (Zasada Nadrzędna)
- Council of Six (Multi-Agent Debate)
- Tech Stack
- Project Structure
- Security Policy (Maximum Autonomy Mode)
- Protocols (PowerShell, MCP)
- Best Practices

## 🤝 Contributing

Ten projekt działa w trybie **Maximum Autonomy**. Przed wprowadzeniem zmian:

1. Przeczytaj **CLAUDE.md** (instrukcje systemowe)
2. Przestrzegaj zasad **Parallel Execution**
3. Używaj **try/catch** z `-ErrorAction Stop`
4. Zawsze **absolute paths**
5. **Loguj z kolorami** (Write-Host -ForegroundColor)

## 📜 License

MIT License - see [LICENSE](LICENSE) for details

## 🔗 Links

- [Claude CLI Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Anthropic API Console](https://console.anthropic.com/)
- [MCP Servers](https://modelcontextprotocol.io/)

---

> *"Trzy głowy, jeden cel. Hydra wykonuje równolegle."*

**HYDRA 10.0** | Maximum Autonomy Mode | Windows 11
