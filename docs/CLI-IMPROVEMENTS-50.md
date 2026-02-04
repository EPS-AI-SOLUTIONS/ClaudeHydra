# 50 Ulepszeń Obsługi Czatu w GeminiHydra CLI

## 📝 Historia i Pamięć (1-8)

### 1. Persystentna Historia Konwersacji
Zapisywanie pełnej historii rozmów do plików JSONL z możliwością wczytania poprzednich sesji.

### 2. Wyszukiwanie w Historii (Ctrl+R)
Interaktywne przeszukiwanie historii komend jak w bash - fuzzy search po poprzednich zapytaniach.

### 3. Historia z Tagami i Kategoriami
Automatyczne tagowanie promptów (code, docs, debug, security) z możliwością filtrowania `/history:code`.

### 4. Kontekst Wielosesyjny
Pamiętanie kontekstu między sesjami - agent pamięta o czym rozmawialiście wczoraj.

### 5. Zakładki/Favorites
`/bookmark` - zapisywanie ulubionych promptów do szybkiego dostępu `/fav 1`.

### 6. Historia per Agent
Oddzielna historia dla każdego agenta Witcher z możliwością przeglądania `/history:Geralt`.

### 7. Eksport Konwersacji
`/export md|json|html` - eksport aktualnej sesji do różnych formatów.

### 8. Wyszukiwanie Semantyczne w Historii
Znajdowanie podobnych zapytań z przeszłości za pomocą embeddings.

---

## ⌨️ Input i Edycja (9-18)

### 9. Edycja Wieloliniowa (Shift+Enter)
Wsparcie dla wieloliniowych promptów z podglądem i edycją.

### 10. Snippet Templates
Predefiniowane szablony promptów: `/template:code-review`, `/template:explain`.

### 11. Zmienne i Placeholdery
Wsparcie dla zmiennych: `explain {{file}} in {{language}}` z interaktywnym wypełnianiem.

### 12. Edytor Zewnętrzny ($EDITOR)
`/edit` - otwiera zewnętrzny edytor dla długich promptów (vim, nano, code).

### 13. Syntax Highlighting w Input
Kolorowanie składni podczas pisania kodu w promptach.

### 14. Auto-Uzupełnianie Nazw Plików
Tab completion dla ścieżek plików w promptach `analyze @./src/[TAB]`.

### 15. Szybkie Wklejanie z Clipboard
`/paste` lub Ctrl+V z inteligentnym formatowaniem wklejonego kodu.

### 16. Makra i Aliasy
`/alias review="code review with best practices"` - własne skróty komend.

### 17. Undo/Redo dla Input
Ctrl+Z/Ctrl+Y dla cofania zmian w edytowanym prompcie.

### 18. Vim Mode
Opcjonalny tryb edycji vi/vim dla zaawansowanych użytkowników.

---

## 🎨 UI/UX i Wizualizacja (19-28)

### 19. Streaming z Animacją
Płynne wyświetlanie odpowiedzi znak po znaku z animowanym kursorem.

### 20. Progress Bar dla Długich Operacji
Wizualny pasek postępu dla wieloetapowych operacji Swarm.

### 21. Split View
Podział ekranu: input na dole, output na górze (ncurses-style).

### 22. Markdown Rendering
Renderowanie Markdown w terminalu z kolorami, tabelami i listami.

### 23. Drzewo Agentów
Wizualizacja która agenci pracują: `Geralt → Yennefer → Triss`.

### 24. Notyfikacje Dźwiękowe
Opcjonalny bell/beep po zakończeniu długiej operacji.

### 25. Motywy Kolorystyczne
Wbudowane motywy: `/theme dark|light|witcher|cyberpunk`.

### 26. Status Bar
Stały pasek na dole z info: agent, model, czas, tryb, tokeny.

### 27. Responsywna Szerokość
Automatyczne dostosowanie szerokości outputu do terminala.

### 28. Obrazki w Terminalu (Sixel/iTerm)
Wyświetlanie diagramów i obrazków w obsługiwanych terminalach.

---

## 🤖 Agenci i Routing (29-36)

### 29. Ręczny Wybór Agenta
`@Geralt analyze this code` - wymuszenie konkretnego agenta.

### 30. Agent Profiles
Profile agentów z custom system prompts i ustawieniami.

### 31. Multi-Agent Parallel
`/parallel @Yennefer @Triss` - równoległe odpytanie wielu agentów.

### 32. Agent Feedback Loop
Interaktywna korekta: "Nie, miałem na myśli X" → agent poprawia.

### 33. Confidence Score Display
Wyświetlanie pewności agenta przy odpowiedzi (85% confident).

### 34. Agent Stats
`/stats` - statystyki użycia agentów, czasy odpowiedzi, skuteczność.

### 35. Custom Agent Creation
`/agent create MyAgent --model phi3 --prompt "..."` - własne agenty.

### 36. Agent Chains
Definiowanie pipeline'ów: Geralt → Yennefer → Vesemir review.

---

## 📁 Kontekst i Pliki (37-42)

### 37. Drag & Drop Plików (dla GUI wrapper)
Przeciąganie plików do terminala automatycznie dodaje je do kontekstu.

### 38. Watch Mode
`/watch ./src` - automatyczne reagowanie na zmiany w plikach.

### 39. Kontekst Projektu
Automatyczne wykrywanie package.json, .git, i dodawanie kontekstu projektu.

### 40. Screenshot Analysis
`/screenshot` - capture ekranu i analiza przez agenta (wymaga GUI).

### 41. URL Fetching
`/fetch https://...` - pobranie i dodanie treści URL do kontekstu.

### 42. Diff Mode
`/diff file1 file2` - analiza różnic z kontekstem.

---

## ⚡ Performance i Optymalizacja (43-47)

### 43. Prompt Caching
Cache dla powtarzających się promptów z configurowalnym TTL.

### 44. Lazy Model Loading
Ładowanie modeli on-demand zamiast wszystkich na starcie.

### 45. Batch Queue
`/queue add "prompt"` - kolejkowanie wielu zapytań do wykonania w tle.

### 46. Prefetch Predictions
Predykcja następnego pytania i pre-warming modelu.

### 47. Token Budget Display
Wyświetlanie zużycia tokenów i pozostałego budżetu w sesji.

---

## 🔧 Komendy i Konfiguracja (48-50)

### 48. Rozszerzone Komendy Slash
```
/config set model llama3.2:3b
/config get temperature
/config reset
/config export ~/.geminihydra
```

### 49. Plugin System
Możliwość ładowania custom plugins z `~/.geminihydra/plugins/`.

### 50. Interactive Config Wizard
`/setup` - interaktywny kreator konfiguracji dla nowych użytkowników.

---

## 📊 Priorytetyzacja Implementacji

### Faza 1 - Quick Wins (1-2 tygodnie)
- [x] Streaming odpowiedzi
- [ ] Persystentna historia (#1)
- [ ] Ctrl+R wyszukiwanie (#2)
- [ ] Ręczny wybór agenta (#29)
- [ ] Status bar (#26)

### Faza 2 - Core UX (2-4 tygodnie)
- [ ] Wieloliniowy input (#9)
- [ ] Markdown rendering (#22)
- [ ] Progress bar (#20)
- [ ] Template snippets (#10)
- [ ] Motywy (#25)

### Faza 3 - Advanced (4-8 tygodni)
- [ ] Vim mode (#18)
- [ ] Plugin system (#49)
- [ ] Watch mode (#38)
- [ ] Multi-agent parallel (#31)
- [ ] Semantic search (#8)

---

## Przykładowa Sesja z Ulepszeniami

```
╔══════════════════════════════════════════════════════════════════╗
║  GeminiHydra v2.0.0 │ Agent: Auto │ Model: llama3.2:3b │ 1,234 tk ║
╚══════════════════════════════════════════════════════════════════╝

[SAFE] Query> @Yennefer /template:code-review ./src/utils.js

⟳ Loading context... [████████░░] 80%
🔮 Yennefer (Sorceress) analyzing...

## Code Review: src/utils.js

### Issues Found (3)
1. **Line 45**: Missing null check
2. **Line 89**: Inefficient loop
3. **Line 123**: Deprecated API usage

### Suggestions
- Use optional chaining `?.`
- Replace `for` with `Array.map()`
- Update to new API v2

Confidence: 92% │ Tokens: 847 │ Time: 2.3s

[SAFE] Query> /bookmark "utils review"
✓ Saved as bookmark #3

[SAFE] Query> /history:Yennefer
  1. [2h ago] code review ./auth.js
  2. [1d ago] refactor database module
  3. [2d ago] implement caching layer

[SAFE] Query> ▌
```

---

## Następne Kroki

1. Przegląd propozycji i wybór priorytetów
2. Stworzenie szczegółowych specyfikacji dla wybranych funkcji
3. Implementacja w sprintach z testami
4. Feedback od użytkowników i iteracja

*Dokument wygenerowany przez GeminiHydra v2.0.0 - School of the Wolf*
