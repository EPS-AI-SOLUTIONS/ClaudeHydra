/**
 * claudeStream — NDJSON streaming API helpers for Claude chat.
 *
 * Extracted from ClaudeChatView.tsx to reduce component file size
 * and enable reuse / unit testing of transport logic.
 */

import { env } from '@/shared/config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extended NDJSON chunk — may be a text token, tool_call, tool_result, or fallback notification. */
interface NdjsonEvent {
  // Text token (backward-compatible)
  token?: string;
  done?: boolean;
  model?: string;
  total_tokens?: number;
  // Extended tool events
  type?: 'tool_call' | 'tool_result' | 'fallback';
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  result?: string;
  is_error?: boolean;
  // Fallback event fields
  from?: string;
  to?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

const AUTH_SECRET = env.VITE_AUTH_SECRET;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export async function claudeHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return false;
    const data = await res.json();
    const anthropic = data.providers?.find((p: { name: string; available: boolean }) => p.name === 'anthropic');
    return anthropic?.available ?? false;
  } catch {
    return false;
  }
}

/**
 * Extended NDJSON streaming — yields text tokens, tool_call, and tool_result events.
 */
export async function* claudeStreamChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  toolsEnabled: boolean,
  sessionId?: string,
  signal?: AbortSignal,
): AsyncGenerator<NdjsonEvent> {
  const res = await fetch('/api/claude/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(AUTH_SECRET ? { Authorization: `Bearer ${AUTH_SECRET}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 4096,
      stream: true,
      tools_enabled: toolsEnabled,
      ...(sessionId && { session_id: sessionId }),
    }),
    ...(signal !== undefined && { signal }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Chat request failed: ${res.status} ${errorText}`);
  }

  if (!res.body) {
    throw new Error('Response body is null — streaming not supported');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event: NdjsonEvent = JSON.parse(line);
        yield event;
      } catch {
        // Ignore NDJSON parse errors on partial lines
      }
    }
  }
}
