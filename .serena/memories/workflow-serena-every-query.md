# Serena Usage Workflow (Every Query)

## Default Steps
1. Run list_memories.
2. Always read baseline memories: policy-serena-longterm-memory, policy-project-identity, and index-memory-catalog.
3. Use index-memory-catalog to route selection (create it if missing).
4. Read any additional memories clearly relevant to the request.
5. Use memory content directly in the response/decisions.
6. If the task is durable (decision, workflow, integration, preference), write or update memory, then update index-memory-catalog (including **Last updated** with time, format yyyy-MM-dd HH:mm).
7. If any memory is created/edited/deleted, update index-memory-catalog automatically (no prompt), and bump **Last updated** with time (yyyy-MM-dd HH:mm).

## Exceptions
- Skip only if Serena tools are unavailable or the user explicitly asks not to use them.

## Notes
- Baseline memories may be re-read each query; avoid re-reading other memories unless needed.
- Keep index-memory-catalog concise and current.
- Prefer Serena for code navigation/edits before other tooling.