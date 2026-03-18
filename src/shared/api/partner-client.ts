/** Jaskier Shared Pattern */
// src/shared/api/partner-client.ts
/**
 * ClaudeHydra — Partner API Client (GeminiHydra cross-query)
 * ===========================================================
 * Fetches sessions from the partner Hydra (GeminiHydra) backend.
 * This is CH-specific and not part of the shared @jaskier/hydra-app API.
 */

import { env } from '../config/env';

const PARTNER_BASE = import.meta.env.PROD ? 'https://geminihydra-v15-backend.fly.dev/api' : '/partner-api';
const PARTNER_AUTH_SECRET = env.VITE_PARTNER_AUTH_SECRET;

interface PartnerSessionSummary {
  id: string;
  title: string;
  created_at: string;
  message_count: number;
  updated_at?: string;
  preview?: string;
}

interface PartnerMessage {
  id: string;
  role: string;
  content: string;
  model?: string | null;
  timestamp: string;
  agent?: string | null;
}

interface PartnerSession {
  id: string;
  title: string;
  created_at: string;
  messages: PartnerMessage[];
}

export async function fetchPartnerSessions(): Promise<PartnerSessionSummary[]> {
  const res = await fetch(`${PARTNER_BASE}/sessions`, {
    signal: AbortSignal.timeout(5000),
    ...(PARTNER_AUTH_SECRET ? { headers: { Authorization: `Bearer ${PARTNER_AUTH_SECRET}` } } : {}),
  });
  if (!res.ok) throw new Error(`Partner API error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.sessions ?? []);
}

export async function fetchPartnerSession(id: string): Promise<PartnerSession> {
  const res = await fetch(`${PARTNER_BASE}/sessions/${id}`, {
    signal: AbortSignal.timeout(10000),
    ...(PARTNER_AUTH_SECRET ? { headers: { Authorization: `Bearer ${PARTNER_AUTH_SECRET}` } } : {}),
  });
  if (!res.ok) throw new Error(`Partner API error: ${res.status}`);
  return res.json();
}
