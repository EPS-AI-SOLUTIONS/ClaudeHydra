# Repository Guidelines

## Project Structure & Module Organization

- `src/`: Node.js MCP server and core logic (entrypoint: `src/server.js`).
- `scripts/`: Dev utilities (e.g., `scripts/doctor.mjs`, `scripts/launcher/`).
- `ai-handler/`: PowerShell orchestration layer and modules (notably `ai-handler/modules/*.psm1`).
- `modules/`: PowerShell GUI helpers used by the launcher/profile.
- `test/`: Unit tests (`*.test.js`) for the Node layer.
- `cache/`, `logs/`: Runtime artifacts (gitignored).
- Docs: `README.md`, `ARCHITECTURE.md`, `GEMINI.md` (Gemini CLI), `CODEX.md` (Codex CLI).

## Build, Test, and Development Commands

- Requires Node.js `>=20` (see `package.json#engines`).
- `npm ci` (preferred) or `npm install`: Install dependencies (lockfile: `package-lock.json`). `pnpm install` is also supported if you use pnpm locally.
- `npm start`: Run the MCP server (`node src/server.js`).
- `npm run launcher`: Launch `./_launcher.ps1` if PowerShell is available; otherwise falls back to `npm start`.
- `npm run doctor`: Validate Node/PowerShell/Ollama availability and basic health checks.
- `npm test`: Run unit tests via Node’s built-in runner (`node --test`).
- `npm run lint`: Run ESLint.
- `npm run format` / `npm run format:write`: Check/apply Prettier formatting.

## Codex CLI

- `start_codex.ps1`: Launch Codex CLI in this repo (`codex run`).
- Keep `CODEX.md` aligned with Codex CLI behavior and constraints.
- Prefer MCP tools when available: Serena for code navigation/memory, Desktop Commander for filesystem/shell, Playwright for web. Use local shell tools only as fallback.

## Coding Style & Naming Conventions

- JavaScript uses ESM (`"type": "module"`); prefer `import`/`export`.
- Prettier is the source of truth (single quotes, semicolons, no trailing commas).
- ESLint: unused params/vars must be prefixed with `_` to avoid lint errors.
- Prefer kebab-case filenames in `src/` (e.g., `prompt-queue.js`); tests end with `.test.js`.

## Testing Guidelines

- Keep unit tests in `test/` and avoid network/Ollama dependencies when possible.
- Name tests `*.test.js` and run them with `npm test`.

## Commit & Pull Request Guidelines

- Follow Conventional Commits seen in history: `feat(scope): ...`, `fix: ...`, `docs: ...`, `chore: ...`.
- PRs should include a clear description, how to verify (`npm test`, `npm run lint`), and note any config changes.
- If you add/rename env vars, update `.env.example` and keep secrets out of Git.

## Security & Configuration Tips

- Copy `.env.example` to `.env` and set `GEMINI_API_KEY`, `OLLAMA_HOST`, and related settings.
- Never commit `.env`, API keys, or tokens; keep local artifacts in `cache/` and `logs/`.
- Treat `CODEX.md` / `GEMINI.md` as operational contracts; review changes carefully.

## Communication Preferences

- Respond in Polish, in the style of Jaskier (The Witcher bard).
- Use sarcasm and light anecdotes; avoid sexual or explicit content.
- Keep the tone witty and playful while staying respectful.
