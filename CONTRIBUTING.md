# Contributing to HYDRA

## Quick Start

1. Clone the repository
2. Install dependencies in each CLI directory:
   ```bash
   cd CodexCLI && npm install
   cd ../DeepSeekCLI && npm install
   cd ../GeminiCLI && npm install
   # ... repeat for other CLI folders
   ```
3. For the desktop app:
   ```bash
   cd hydra-launcher && npm install
   ```
4. Run tests: `npm test` (in relevant directories)

## Project Structure

- `.claude/` - Claude CLI configuration and commands
- `GeminiCLI/` - Google Gemini MCP server integration
- `JulesCLI/` - Google Jules async tasks integration
- `CodexCLI/` - OpenAI Codex/GPT-5 integration
- `GrokCLI/` - xAI Grok integration
- `DeepSeekCLI/` - DeepSeek multi-language support
- `hydra-launcher/` - Tauri desktop application
- `docs/` - Project documentation

## Code Style

- Follow existing patterns in the codebase
- Use ESLint for JavaScript/TypeScript where configured
- Use Prettier for code formatting where configured
- Write tests for new features in their respective CLI directories

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Run tests and linting in affected directories
4. Commit with conventional commit messages (see below)
5. Push your branch and submit a PR with a clear description

## Commit Convention

Use conventional commits for clarity:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring (no feature/fix change)
- `test:` - Adding or updating tests
- `chore:` - Build, dependencies, CI/CD updates

**Example:**
```
feat(GeminiCLI): add streaming response support

This adds real-time streaming capabilities to Gemini responses,
improving performance for long-running queries.
```

## Working with Multiple CLIs

Each CLI folder is semi-independent but shares the common HYDRA configuration:

- Update `.claude/config/multi-cli.json` for routing changes
- Update `hydra-config.json` for SWARM protocol changes
- Test your CLI in isolation before integration testing

## License

MIT License - See LICENSE file for details

## Questions?

- Check `CLAUDE.md` for HYDRA architecture overview
- Review `.claude/hydra/` for detailed specifications
- Check individual CLI README files for setup instructions
