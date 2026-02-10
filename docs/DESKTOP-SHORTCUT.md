# Desktop Shortcut Guide

## Szybkie Tworzenie Skrótu

### ⭐ Metoda 1: Oba Skróty (Standard + Verbose)

```bash
# NAJLEPSZE: Tworzy oba skróty naraz
pnpm run shortcut:both
```

**LUB Double-Click:**
- `create-both-shortcuts.bat`
- `create-both-shortcuts.vbs`

---

### Metoda 2: NPM Script (Pojedyncze)

```bash
# Standardowy skrót (Swarm mode)
pnpm run shortcut

# Skrót z verbose logging
pnpm run shortcut:verbose

# Wszystkie warianty (5 skrótów)
pnpm run shortcut:all
```

---

### Metoda 2: PowerShell Script (Zaawansowana)

```powershell
# Standardowy (Swarm mode)
.\scripts\create-shortcut.ps1

# Verbose mode
.\scripts\create-shortcut.ps1 -Verbose

# Trace mode (full logging)
.\scripts\create-shortcut.ps1 -Mode swarm-trace

# Enhanced mode
.\scripts\create-shortcut.ps1 -Mode enhanced

# Basic mode
.\scripts\create-shortcut.ps1 -Mode basic

# Wszystkie warianty
.\scripts\create-shortcut.ps1 -AllModes
```

---

### Metoda 3: Batch File (Double-Click)

```batch
# Double-click na:
scripts\create-shortcut.bat
```

---

## Dostępne Warianty Skrótów

| Nazwa Skrótu | Mode | Logging | Opis |
|--------------|------|---------|------|
| **ClaudeHydra CLI (Swarm)** | swarm | INFO | Standardowy 12-agent swarm |
| **ClaudeHydra CLI (Swarm Verbose)** | swarm | DEBUG | Swarm + szczegółowe logi |
| **ClaudeHydra CLI (Swarm Trace)** | swarm | TRACE | Swarm + pełne trace logi |
| **ClaudeHydra CLI (Enhanced)** | enhanced | INFO | Tryb rozszerzony |
| **ClaudeHydra CLI (Basic)** | basic | INFO | Tryb podstawowy |

---

## Ikony (Opcjonalne)

### Aby dodać niestandardową ikonę:

1. **Wygeneruj ikonę z emoji:**
   - Otwórz: https://favicon.io/emoji-favicons/snake/
   - Pobierz PNG → Konwertuj na ICO (https://convertio.co/png-ico/)

2. **Zapisz jako:**
   ```
   assets/icon.ico
   ```

3. **Uruchom ponownie:**
   ```bash
   pnpm run shortcut
   ```

### Przykładowe emoji:
- 🐍 Snake (Hydra theme)
- ⚡ Lightning (Power/Speed)
- 🔮 Crystal Ball (AI/Magic)
- 🗡️ Sword (Witcher theme)

---

## Output Skryptu

```
╔══════════════════════════════════════╗
║  ClaudeHydra Shortcut Creator  ║
╚══════════════════════════════════════╝

🐍 Created: ClaudeHydra CLI (Swarm)
   Path: C:\Users\YourName\Desktop\ClaudeHydra CLI (Swarm).lnk

✅ Shortcut(s) created successfully!

💡 Usage:
   Double-click the shortcut on your desktop to launch ClaudeHydra

📖 More shortcuts:
   .\scripts\create-shortcut.ps1 -AllModes    # Create all variants
   .\scripts\create-shortcut.ps1 -Verbose     # Create verbose mode
   .\scripts\create-shortcut.ps1 -Mode basic  # Create basic mode
```

---

## Troubleshooting

### **Błąd: "Execution Policy"**
```powershell
# Uruchom PowerShell jako Administrator:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### **Skrót nie działa**
1. Sprawdź czy `pnpm` jest zainstalowany:
   ```bash
   pnpm --version
   ```

2. Sprawdź ścieżkę w skrócie:
   - Prawy klik na skrót → Properties
   - Verify "Target" path is correct

### **Brak ikony**
- Skrypt automatycznie użyje domyślnej ikony CMD.exe
- Aby zmienić, dodaj `assets/icon.ico` (patrz sekcja Ikony)

---

## Modyfikacja Skryptów

### Dodanie własnego wariantu:

Edytuj `scripts/create-shortcut.ps1`:

```powershell
"my-custom" = @{
    Name = "ClaudeHydra CLI (Custom)"
    Args = "--mode swarm --verbose --my-flag"
    Desc = "My custom configuration"
    Icon = "🎯"
}
```

Następnie:
```powershell
.\scripts\create-shortcut.ps1 -Mode my-custom
```

---

## FAQ

**Q: Czy mogę mieć wiele skrótów?**
A: Tak! Użyj `-AllModes` aby stworzyć wszystkie warianty.

**Q: Skrót otwiera CMD, ale CLI nie startuje?**
A: Sprawdź czy jesteś w katalogu projektu i masz zainstalowane `pnpm`.

**Q: Jak usunąć skróty?**
A: Po prostu usuń pliki `.lnk` z pulpitu.

**Q: Czy mogę zmienić katalog roboczy?**
A: Tak, edytuj `$ProjectDir` w `create-shortcut.ps1`.

---

## Zaawansowane

### Tworzenie skrótu na Start Menu:

```powershell
$StartMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
# Zmień $DesktopPath na $StartMenuPath w skrypcie
```

### Tworzenie skrótu z niestandardowym kolorem terminala:

Dodaj do Arguments:
```powershell
$Shortcut.Arguments = "/k color 0A && cd /d `"$ProjectDir`" && pnpm start $Args"
#                           ^^
#                           Green on Black
```

Kody kolorów: https://ss64.com/nt/color.html
