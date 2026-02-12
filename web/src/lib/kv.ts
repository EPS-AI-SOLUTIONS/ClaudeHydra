import { Redis } from '@upstash/redis';

// Singleton Upstash Redis client
let redis: Redis | null = null;

export function getKv(): Redis {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // Fallback: in-memory mock for local dev without Upstash
    console.warn('[KV] UPSTASH_REDIS_REST_URL / TOKEN not set — using in-memory fallback');
    return getMemoryKv();
  }

  redis = new Redis({ url, token });
  return redis;
}

// ── In-memory KV for local development ──────────────────────────────────────

const memStore = new Map<string, string>();
const sortedSets = new Map<string, Map<string, number>>();

function getMemoryKv(): Redis {
  // Return a proxy that implements the Redis methods we actually use
  // This avoids requiring Upstash credentials for local dev
  const mock = {
    get: async (key: string) => {
      const val = memStore.get(key);
      return val ? JSON.parse(val) : null;
    },
    set: async (key: string, value: unknown) => {
      memStore.set(key, JSON.stringify(value));
      return 'OK';
    },
    del: async (...keys: string[]) => {
      let count = 0;
      for (const k of keys) {
        if (memStore.delete(k)) count++;
      }
      return count;
    },
    exists: async (...keys: string[]) => {
      return keys.filter((k) => memStore.has(k)).length;
    },
    keys: async (pattern: string) => {
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
      return [...memStore.keys()].filter((k) => regex.test(k));
    },
    zadd: async (key: string, ...args: Array<{ score: number; member: string }>) => {
      if (!sortedSets.has(key)) sortedSets.set(key, new Map());
      const ss = sortedSets.get(key)!;
      let added = 0;
      for (const { score, member } of args) {
        if (!ss.has(member)) added++;
        ss.set(member, score);
      }
      return added;
    },
    zrange: async (key: string, start: number, stop: number, opts?: { rev?: boolean }) => {
      const ss = sortedSets.get(key);
      if (!ss) return [];
      const entries = [...ss.entries()].sort((a, b) => (opts?.rev ? b[1] - a[1] : a[1] - b[1]));
      const end = stop === -1 ? entries.length : stop + 1;
      return entries.slice(start, end).map(([member]) => member);
    },
    zrem: async (key: string, ...members: string[]) => {
      const ss = sortedSets.get(key);
      if (!ss) return 0;
      let removed = 0;
      for (const m of members) {
        if (ss.delete(m)) removed++;
      }
      return removed;
    },
    zcard: async (key: string) => {
      return sortedSets.get(key)?.size ?? 0;
    },
    pipeline: () => {
      const ops: Array<() => Promise<unknown>> = [];
      const pipe = new Proxy(
        {},
        {
          get(_target, prop: string) {
            if (prop === 'exec') {
              return async () => {
                const results = [];
                for (const op of ops) {
                  results.push(await op());
                }
                return results;
              };
            }
            // Queue the operation
            return (...args: unknown[]) => {
              ops.push(
                () =>
                  (mock as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop](
                    ...args,
                  ) as Promise<unknown>,
              );
              return pipe;
            };
          },
        },
      );
      return pipe;
    },
  } as unknown as Redis;

  redis = mock;
  return mock;
}

// ── Key namespace helpers ───────────────────────────────────────────────────

export const KV_KEYS = {
  // Chat sessions
  session: (id: string) => `cs:${id}`,
  sessionList: 'cs:list',

  // Chat messages
  message: (id: string) => `cm:${id}`,
  messagesBySession: (sessionId: string) => `cm:by-session:${sessionId}`,

  // Agent memories
  memory: (id: string) => `am:${id}`,
  memoriesByAgent: (agent: string) => `am:by-agent:${agent}`,

  // Knowledge graph
  knowledgeNode: (id: string) => `kn:${id}`,
  knowledgeEdge: (id: string) => `ke:${id}`,
  knowledgeNodeList: 'kn:list',
  knowledgeEdgeList: 'ke:list',

  // Preferences
  preference: (key: string) => `pref:${key}`,

  // Approval history & rules
  approvalHistory: (id: string) => `ah:${id}`,
  approvalHistoryList: 'ah:list',
  approvalRule: (id: string) => `ar:${id}`,
  approvalRuleList: 'ar:list',

  // RAG documents
  ragDocument: (id: string) => `rag:${id}`,
  ragDocumentList: 'rag:list',

  // Training examples
  trainingExample: (id: string) => `te:${id}`,
  trainingExampleList: 'te:list',
} as const;
