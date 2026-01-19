# HYDRA 10.6.1 Troubleshooting Guide

## Frequently Asked Questions

### General Issues

**Q: The HYDRA orchestrator isn't responding**
A: Check that all MCP servers are running:
- Verify Serena MCP is active: `mcp-server-serena`
- Verify Desktop Commander is running
- Check if Playwright is properly installed: `npx playwright install`

**Q: Commands are timing out**
A: Increase timeout values in `.claude/config/multi-cli.json` or:
1. Check network connectivity to external CLI providers
2. Verify API keys are valid for Gemini, Codex, and Grok
3. Monitor system resources (CPU, memory, disk)

**Q: SWARM Protocol isn't executing all 6 steps**
A: The protocol may short-circuit if:
- ROUTE step fails to identify agents → check task description clarity
- SPECULATE timeout → increase timeout in config
- PLAN fails → verify task constraints are valid
- EXECUTE has agent failures → check individual CLI logs

### Multi-CLI Issues

**Q: Gemini CLI returns "context exceeded" errors**
A: Even with 2M token context:
1. Split large documents into smaller chunks
2. Use summarization before processing
3. Check `.claude/config/multi-cli.json` for max_tokens setting

**Q: Codex/Grok CLIs show "API key invalid"**
A: 
1. Verify keys in environment variables or `.env` files
2. Check key permissions and rate limits
3. Ensure keys haven't expired
4. For OpenAI Codex: verify GPT-5-Codex access is enabled

**Q: Jules CLI doesn't complete background tasks**
A: Jules operates asynchronously:
1. Check `hydra-launcher` logs for async task queue
2. Verify task priority and scheduling
3. Monitor memory usage (async tasks can accumulate)

**Q: DeepSeek CLI language support isn't working**
A: DeepSeek supports 100+ languages:
1. Specify language explicitly in request: `/deepseek --lang=<code>`
2. Check language code is ISO 639-1 compliant
3. Verify UTF-8 encoding in input files

### Local AI (Ollama)

**Q: Ollama models not found or failing**
A: 
1. Verify Ollama is installed and running: `ollama serve`
2. Check available models: `ollama list`
3. Pull missing models:
   ```bash
   ollama pull llama3.2:3b
   ollama pull qwen2.5-coder
   ollama pull phi3:mini
   ```
4. Verify sufficient disk space for model files

**Q: Local AI responses are slow**
A:
1. Reduce model quantization if available
2. Check GPU support: `ollama gpu`
3. Reduce batch size in Ollama config
4. Use smaller models (3B instead of 7B/13B)

**Q: HYDRA isn't routing to Ollama**
A:
1. Verify Ollama endpoint is reachable (default: http://localhost:11434)
2. Check `.claude/config/multi-cli.json` Ollama routing rules
3. Ensure query matches Ollama routing conditions (see Witcher Mode docs)

### Serena MCP Issues

**Q: Symbol analysis returns incomplete results**
A:
1. Verify file is in supported language (JS, TS, Python, Go, Java, etc.)
2. Check syntax is valid - Serena requires parseable code
3. For large files, use relative path patterns instead of absolute
4. Check `relative_path` parameter format matches project structure

**Q: Find_referencing_symbols returns no results**
A:
1. Verify symbol exists and is exported
2. Check if symbol is used in the queried paths
3. Expand search scope with broader path patterns
4. Use `substring_matching: true` for partial matches

**Q: Memory errors with large codebase analysis**
A:
1. Split analysis into multiple focused queries
2. Use path filters to reduce scope: `path: "src/components/"`
3. Reduce context lines in search results: `context_lines_before: 2`
4. Use `max_answer_chars` parameter to limit output size

### Desktop Commander Issues

**Q: File operations return "permission denied"**
A:
1. Check file/directory permissions
2. Verify user has write access to target directory
3. On Windows, check if file is locked by another process
4. Try running with elevated privileges if needed

**Q: Process execution times out**
A:
1. Increase `timeout_ms` parameter (default: 120000ms)
2. Verify command syntax for your OS (Windows vs Linux/Mac)
3. Check if process is waiting for input (requires `interact_with_process`)
4. For long-running processes, use `run_in_background: true`

**Q: Browser automation (Playwright) fails to load pages**
A:
1. Verify page URL is accessible and not behind authentication
2. Check network connectivity
3. Increase wait timeout: `timeout_ms: 10000`
4. Ensure page has loaded before taking actions
5. For protected pages, use Vercel sharelink tool if applicable

### Configuration Issues

**Q: Changes to multi-cli.json aren't taking effect**
A:
1. Verify JSON syntax is valid (no trailing commas, etc.)
2. Restart all CLI services after changes
3. Check file permissions (must be readable by CLI processes)
4. Verify you're editing the correct multi-cli.json location

**Q: Slash commands aren't recognized**
A:
1. Check command is spelled correctly (case-sensitive)
2. Verify command exists in `.claude/commands/`
3. Ensure Claude CLI extension is updated
4. Reload Claude interface or restart

## Debug Mode

Enable detailed logging:

```json
{
  "debug": {
    "enabled": true,
    "level": "verbose",
    "log_file": "logs/hydra-debug.log",
    "include_timestamps": true,
    "include_stack_traces": true
  }
}
```

## Performance Optimization

### SWARM Protocol Tuning

Adjust in `.claude/config/multi-cli.json`:
```json
{
  "swarm": {
    "parallel_agents": 4,
    "timeout_per_step": 30000,
    "speculate_depth": "medium",
    "synthesis_strategy": "consensus"
  }
}
```

### Multi-CLI Routing

Optimize routing decisions:
```json
{
  "routing": {
    "context_threshold": 100000,
    "latency_threshold": 2000,
    "preferred_providers": ["gemini", "deepseek", "hydra"]
  }
}
```

## Reporting Issues

When reporting issues:
1. Include relevant configuration from `.claude/config/multi-cli.json`
2. Provide complete error messages and stack traces
3. Note which CLIs are active at time of issue
4. Include system info (OS, Node version, available memory)
5. Provide minimal reproducible example

## Support Resources

- Main docs: `C:\Users\BIURODOM\Desktop\ClaudeHYDRA\CLAUDE.md`
- Architecture: `C:\Users\BIURODOM\Desktop\ClaudeHYDRA\docs\architecture.md`
- HYDRA Core: `.claude/hydra/HYDRA_CORE.md`
- Agent Specs: `.claude/hydra/HYDRA_AGENTS.md`
