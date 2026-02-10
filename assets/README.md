# ClaudeHydra Assets

## Icon Files

Umieść tutaj plik `icon.ico` aby używać niestandardowej ikony dla skrótów na pulpicie.

### Generowanie Ikony z Emoji (Windows)

```powershell
# Użyj narzędzia online do konwersji emoji → ICO:
# 1. Otwórz: https://favicon.io/emoji-favicons/snake/
# 2. Pobierz wygenerowany plik jako "icon.ico"
# 3. Skopiuj do tego katalogu (assets/)
```

### Alternatywnie - Użyj Istniejących Ikon Windows

Skrypt automatycznie użyje domyślnej ikony CMD.exe jeśli `icon.ico` nie istnieje.

### Przykładowe Emoji dla ClaudeHydra:
- 🐍 (Snake) - Hydra theme
- ⚡ (Lightning) - Enhanced mode
- 🔮 (Crystal Ball) - AI/Magic theme
- 🗡️ (Sword) - Witcher theme

### Struktura:
```
assets/
  ├── icon.ico           # Main icon (16x16, 32x32, 48x48, 256x256)
  ├── icon-verbose.ico   # Optional: Verbose mode icon
  ├── icon-trace.ico     # Optional: Trace mode icon
  └── README.md          # This file
```
