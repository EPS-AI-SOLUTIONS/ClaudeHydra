# Memory of Regis

## Session 2026-02-09: SDK settingSources Fix

### Root Cause
Claude Agent SDK subprocess was crashing (exit code 1) because it loaded `.claude/settings.local.json`
which contained `enableAllProjectMcpServers: true` and 23 MCP servers. The subprocess tried to connect
to all servers, many failed, causing the crash.

### Fix
Added `settingSources: []` to all SDK `query()` calls in `src/hydra/providers/claude-client.ts`:
- `_executeSdkCall()` — main generate path
- `streamGenerate()` — streaming path
- `healthCheck()` — health check path

This prevents the subprocess from loading filesystem settings (user/project/local),
so it doesn't try to connect to MCP servers that are already managed by the parent CLI process.

### Impact
- Response time: from crash → 3.5s for simple queries
- All 3 SDK call paths fixed
- No regression on direct SDK usage
