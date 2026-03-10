/** Jaskier Shared Pattern */
// src/shared/api/client.ts
/**
 * ClaudeHydra v4 - Typed API Client
 * ===================================
 * Fetch wrapper for the Rust/Axum backend on port 8082.
 * Provides typed GET/POST/PATCH/DELETE with ApiError handling
 * and automatic retry with exponential backoff for network failures.
 */

import { toast } from 'sonner';
import { env } from '../config/env';

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
export const BASE_URL =
  env.VITE_BACKEND_URL ?? (import.meta.env.PROD && !isLocalhost ? 'https://claudehydra-v4-backend.fly.dev' : '');
const AUTH_SECRET = env.VITE_AUTH_SECRET;

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const REQUEST_TIMEOUT_MS = 45_000; // 45 seconds per attempt
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

// -------------------------------------------------------------------
// Error class
// -------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

// -------------------------------------------------------------------
// Retry wrapper
// -------------------------------------------------------------------

/**
 * Retry with exponential backoff + jitter.
 * - Network errors (TypeError): always retried regardless of method.
 * - Retryable HTTP statuses (408, 429, 500, 502, 503, 504): retried only
 *   for idempotent methods (GET, HEAD) to avoid duplicating side-effects.
 */
async function fetchWithRetry(url: string, init: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  const method = init.method?.toUpperCase() ?? 'GET';
  const isIdempotent = method === 'GET' || method === 'HEAD';
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Per-attempt timeout via AbortController
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

    // Combine with caller-provided signal (if any) so both can abort
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutController.signal]) : timeoutController.signal;

    try {
      const response = await fetch(url, { ...init, signal });
      clearTimeout(timeoutId);

      // Success or non-retryable client error — return immediately
      if (response.ok || !RETRYABLE_STATUSES.has(response.status)) {
        return response;
      }

      // Retryable HTTP status — only retry idempotent methods
      if (isIdempotent && attempt < retries) {
        const delay = RETRY_BASE_MS * 2 ** attempt + Math.random() * 500;
        console.warn(
          `[api] HTTP ${String(response.status)} on ${method} ${url}, retrying in ${String(Math.round(delay))}ms (${String(attempt + 1)}/${String(retries)})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response; // Last attempt or non-idempotent — return as-is
    } catch (err) {
      clearTimeout(timeoutId);

      // Timeout abort — show toast and throw immediately (no retry)
      if (timeoutController.signal.aborted) {
        toast.error('Request timed out. Please try again.');
        throw new Error('Request timed out');
      }

      // Caller-provided signal aborted — propagate without retry
      if (init.signal?.aborted) {
        throw err;
      }

      lastError = err instanceof Error ? err : new Error(String(err));
      // Network failure (TypeError) — retry regardless of method
      if (attempt < retries && err instanceof TypeError) {
        const delay = RETRY_BASE_MS * 2 ** attempt + Math.random() * 500;
        console.warn(
          `[api] Network error on ${method} ${url}, retrying in ${String(Math.round(delay))}ms (${String(attempt + 1)}/${String(retries)})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error('Request failed after retries');
}

// -------------------------------------------------------------------
// Internal fetch helper
// -------------------------------------------------------------------

async function apiFetch<T>(path: string, options: RequestInit = {}, retries?: number): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const response = await fetchWithRetry(
    url,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(AUTH_SECRET ? { Authorization: `Bearer ${AUTH_SECRET}` } : {}),
        ...options.headers,
      },
    },
    retries,
  );

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }

    if (response.status === 401) {
      toast.error('Authentication required', {
        description: 'Check your AUTH_SECRET configuration',
      });
    } else if (response.status === 403) {
      toast.error('Access denied', {
        description: 'Insufficient permissions for this action',
      });
    }

    throw new ApiError(response.status, response.statusText, body);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// -------------------------------------------------------------------
// In-flight GET request deduplication (#32)
// -------------------------------------------------------------------

const inflightGets = new Map<string, Promise<unknown>>();

async function deduplicatedGet<T>(path: string): Promise<T> {
  const existing = inflightGets.get(path);
  if (existing) return existing as Promise<T>;

  const promise = apiFetch<T>(path, { method: 'GET' }).finally(() => {
    inflightGets.delete(path);
  });
  inflightGets.set(path, promise);
  return promise;
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

export async function apiGet<T>(path: string): Promise<T> {
  return deduplicatedGet<T>(path);
}

/** Polling-safe GET — deduped, no fetch-level retries, no console warnings on failure. */
export async function apiGetPolling<T>(path: string): Promise<T> {
  const existing = inflightGets.get(path);
  if (existing) return existing as Promise<T>;

  const promise = apiFetch<T>(path, { method: 'GET' }, 0).finally(() => {
    inflightGets.delete(path);
  });
  inflightGets.set(path, promise);
  return promise;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PATCH',
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' });
}

// -------------------------------------------------------------------
// Health check
// -------------------------------------------------------------------

export interface HealthStatus {
  ready: boolean;
  uptime_seconds?: number;
}

/** Lightweight readiness check — no retries, short timeout. */
export async function checkHealth(): Promise<HealthStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${BASE_URL}/api/health/ready`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      return (await response.json()) as HealthStatus;
    }

    // 503 = starting up
    if (response.status === 503) {
      const body = (await response.json()) as HealthStatus;
      return { ready: false, ...(body.uptime_seconds !== undefined && { uptime_seconds: body.uptime_seconds }) };
    }

    return { ready: false };
  } catch {
    return { ready: false };
  }
}

// -------------------------------------------------------------------
// Partner API
// -------------------------------------------------------------------

const PARTNER_BASE = import.meta.env.PROD ? 'https://geminihydra-v15-backend.fly.dev/api' : '/partner-api';
const PARTNER_AUTH_SECRET = env.VITE_PARTNER_AUTH_SECRET;

export interface PartnerSessionSummary {
  id: string;
  title: string;
  created_at: string;
  message_count: number;
  updated_at?: string;
  preview?: string;
}

export interface PartnerMessage {
  id: string;
  role: string;
  content: string;
  model?: string | null;
  timestamp: string;
  agent?: string | null;
}

export interface PartnerSession {
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
