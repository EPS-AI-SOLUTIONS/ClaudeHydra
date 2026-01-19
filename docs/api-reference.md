# HYDRA API Reference

This document provides comprehensive API documentation for the HYDRA utility modules.

---

## Table of Contents

1. [Cache API](#cache-api)
2. [Logger API](#logger-api)
3. [LRU Cache API](#lru-cache-api)
4. [Environment Validator API](#environment-validator-api)
5. [Health Check API](#health-check-api)

---

## Cache API

**Location:** `GeminiCLI/src/cache.js`

SHA256-based response caching system with optional AES-256-GCM encryption.

### `getCache(prompt, model)`

Retrieves a cached response for the given prompt and model combination.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | `string` | - | The prompt text to look up |
| `model` | `string` | `''` | Optional model identifier |

**Returns:** `object | null`
```javascript
{
  response: string,    // Cached response text
  source: string,      // Provider source (e.g., 'ollama', 'gemini')
  cached: boolean,     // Always true for cache hits
  age: number          // Age in seconds since cached
}
```

**Example:**
```javascript
import { getCache } from './cache.js';

const cached = getCache('Explain quantum computing', 'llama3.2:3b');
if (cached) {
  console.log(`Cache hit! Age: ${cached.age}s`);
  console.log(cached.response);
}
```

---

### `setCache(prompt, response, model, source)`

Stores a response in the cache.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | `string` | - | The prompt text |
| `response` | `string` | - | The response to cache |
| `model` | `string` | `''` | Model identifier |
| `source` | `string` | `'ollama'` | Provider source |

**Returns:** `boolean` - `true` if successfully cached, `false` otherwise

**Example:**
```javascript
import { setCache } from './cache.js';

const success = setCache(
  'What is JavaScript?',
  'JavaScript is a programming language...',
  'llama3.2:3b',
  'ollama'
);
console.log(success ? 'Cached!' : 'Cache failed');
```

---

### `getCacheStats()`

Returns statistics about the current cache state.

**Parameters:** None

**Returns:** `object`
```javascript
{
  totalEntries: number,   // Total cache files
  validEntries: number,   // Non-expired entries
  expiredEntries: number, // Expired entries
  totalSizeKB: number,    // Total size in kilobytes
  cacheDir: string        // Cache directory path
}
```

**Example:**
```javascript
import { getCacheStats } from './cache.js';

const stats = getCacheStats();
console.log(`Cache: ${stats.validEntries}/${stats.totalEntries} valid entries`);
console.log(`Size: ${stats.totalSizeKB} KB`);
```

---

### `invalidateByPattern(pattern)`

Deletes cache entries matching a pattern.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string \| RegExp` | Pattern to match against cache keys (model:prompt) |

**Returns:** `object`
```javascript
{
  deleted: number,  // Number of entries deleted
  errors: number    // Number of errors encountered
}
```

**Example:**
```javascript
import { invalidateByPattern } from './cache.js';

// Delete all entries for a specific model
const result = invalidateByPattern(/llama3\.2/);
console.log(`Deleted ${result.deleted} entries`);

// Delete entries containing specific text
const result2 = invalidateByPattern('quantum');
```

---

### `invalidateExpired()`

Removes all expired cache entries.

**Parameters:** None

**Returns:** `object`
```javascript
{
  deleted: number,  // Number of entries deleted
  errors: number,   // Number of errors encountered
  freedKB: number   // Disk space freed in KB
}
```

**Example:**
```javascript
import { invalidateExpired } from './cache.js';

const cleanup = invalidateExpired();
console.log(`Cleaned ${cleanup.deleted} expired entries, freed ${cleanup.freedKB} KB`);
```

---

### `clearCache()`

Removes all cache entries.

**Parameters:** None

**Returns:** `object`
```javascript
{
  deleted: number,  // Number of entries deleted
  freedKB: number   // Disk space freed in KB
}
```

**Example:**
```javascript
import { clearCache } from './cache.js';

const result = clearCache();
console.log(`Cache cleared: ${result.deleted} entries, ${result.freedKB} KB freed`);
```

---

## Logger API

**Location:** `GeminiCLI/src/logger.js`

Structured logging with correlation ID support for request tracing.

### `createLogger(module)`

Creates a new logger instance for a module.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `module` | `string` | Module name for log prefixing |

**Returns:** `Logger` object with methods: `debug`, `info`, `warn`, `error`, `withCorrelation`

**Example:**
```javascript
import { createLogger } from './logger.js';

const logger = createLogger('cache');

logger.info('Cache initialized');
logger.debug('Processing request', { key: 'abc123' });
logger.warn('Cache nearly full', { usage: 95 });
logger.error('Cache write failed', { error: err.message });
```

**Output formats:**

Development:
```
[cache] Cache initialized
[cache] Processing request {"key":"abc123"}
```

Production (JSON):
```json
{"timestamp":"2025-01-19T10:30:00.000Z","level":"info","module":"cache","correlationId":null,"message":"Cache initialized"}
```

---

### `generateCorrelationId()`

Generates a unique correlation ID for request tracing.

**Parameters:** None

**Returns:** `string` - Format: `hydra-{timestamp}-{random}`

**Example:**
```javascript
import { generateCorrelationId } from './logger.js';

const correlationId = generateCorrelationId();
// Output: "hydra-m5x8f4g2-a1b2c3d4"
```

---

### `withCorrelationId(correlationId, fn)`

Executes a function with a correlation ID context.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `correlationId` | `string` | The correlation ID to use |
| `fn` | `Function` | Function to execute in context |

**Returns:** The return value of `fn`

**Example:**
```javascript
import { withCorrelationId, createLogger, generateCorrelationId } from './logger.js';

const logger = createLogger('api');
const correlationId = generateCorrelationId();

await withCorrelationId(correlationId, async () => {
  logger.info('Processing request');  // Includes correlation ID
  const result = await processData();
  logger.info('Request complete');
  return result;
});
```

---

### `correlationMiddleware(req, res, next)`

Express/Koa middleware that injects correlation IDs into requests.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `req` | `object` | Express request object |
| `res` | `object` | Express response object |
| `next` | `Function` | Next middleware function |

**Example:**
```javascript
import express from 'express';
import { correlationMiddleware, createLogger } from './logger.js';

const app = express();
const logger = createLogger('api');

app.use(correlationMiddleware);

app.get('/api/data', (req, res) => {
  // Correlation ID automatically included in logs
  logger.info('Handling /api/data');
  res.json({ data: 'example' });
});
```

**Behavior:**
- Uses `x-correlation-id` header if provided
- Generates new ID if header is missing
- Sets `x-correlation-id` response header

---

## LRU Cache API

**Location:** `GeminiCLI/src/lru-cache.js`

In-memory Least Recently Used cache with TTL support.

### `LRUCache` Class

#### Constructor

```javascript
new LRUCache(options)
```

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxSize` | `number` | `100` | Maximum number of entries |
| `ttlMs` | `number` | `300000` | Default TTL in milliseconds (5 min) |

**Example:**
```javascript
import { LRUCache } from './lru-cache.js';

const cache = new LRUCache({
  maxSize: 200,
  ttlMs: 60000  // 1 minute
});
```

---

#### `cache.get(key)`

Retrieves a value from the cache.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Cache key |

**Returns:** `any | undefined` - The cached value or `undefined` if not found/expired

**Example:**
```javascript
const value = cache.get('user:123');
if (value !== undefined) {
  console.log('Cache hit:', value);
}
```

---

#### `cache.set(key, value, ttlMs)`

Stores a value in the cache.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `key` | `string` | - | Cache key |
| `value` | `any` | - | Value to store |
| `ttlMs` | `number` | `this.ttlMs` | Optional custom TTL |

**Returns:** `LRUCache` - The cache instance (chainable)

**Example:**
```javascript
cache.set('user:123', { name: 'John' });
cache.set('session:abc', tokenData, 30000);  // 30 second TTL

// Chaining
cache
  .set('key1', 'value1')
  .set('key2', 'value2');
```

---

#### `cache.has(key)`

Checks if a key exists and is not expired.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Cache key |

**Returns:** `boolean`

**Example:**
```javascript
if (cache.has('user:123')) {
  console.log('User is cached');
}
```

---

#### `cache.delete(key)`

Removes an entry from the cache.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Cache key |

**Returns:** `boolean` - `true` if entry was deleted

**Example:**
```javascript
cache.delete('user:123');
```

---

#### `cache.clear()`

Removes all entries from the cache.

**Returns:** `LRUCache` - The cache instance (chainable)

**Example:**
```javascript
cache.clear();
```

---

#### `cache.size`

Property returning the current number of entries.

**Returns:** `number`

**Example:**
```javascript
console.log(`Cache has ${cache.size} entries`);
```

---

#### `cache.getStats()`

Returns cache statistics.

**Returns:** `object`
```javascript
{
  hits: number,      // Number of cache hits
  misses: number,    // Number of cache misses
  evictions: number, // Number of LRU evictions
  expired: number,   // Number of expired entries
  size: number,      // Current number of entries
  maxSize: number,   // Maximum capacity
  hitRate: string    // Hit rate percentage (e.g., "85.50%")
}
```

**Example:**
```javascript
const stats = cache.getStats();
console.log(`Hit rate: ${stats.hitRate}`);
console.log(`Size: ${stats.size}/${stats.maxSize}`);
```

---

#### `cache.resetStats()`

Resets all statistics counters.

**Returns:** `LRUCache` - The cache instance (chainable)

**Example:**
```javascript
cache.resetStats();
```

---

#### `cache.prune()`

Removes all expired entries.

**Returns:** `number` - Number of entries pruned

**Example:**
```javascript
const pruned = cache.prune();
console.log(`Pruned ${pruned} expired entries`);
```

---

#### `cache.keys()`

Returns all cache keys.

**Returns:** `string[]`

**Example:**
```javascript
const keys = cache.keys();
console.log('Cached keys:', keys);
```

---

#### `cache.entries()`

Returns all entries with metadata.

**Returns:** `Array<{ key: string, value: any, expiresIn: number }>`

**Example:**
```javascript
const entries = cache.entries();
entries.forEach(entry => {
  console.log(`${entry.key}: expires in ${entry.expiresIn}ms`);
});
```

---

### Pre-configured Cache Instances

```javascript
import { modelCache, responseCache, symbolCache } from './lru-cache.js';

// modelCache: maxSize=50, ttlMs=600000 (10 min)
// responseCache: maxSize=200, ttlMs=300000 (5 min)
// symbolCache: maxSize=500, ttlMs=120000 (2 min)
```

---

## Environment Validator API

**Location:** `GeminiCLI/src/env-validator.js`

Environment variable validation and security checks.

### `validateEnv()`

Validates all required and optional environment variables.

**Parameters:** None

**Returns:** `object`
```javascript
{
  valid: boolean,      // true if all required vars present
  missing: string[],   // List of missing required variables
  warnings: string[],  // List of warnings (format issues, defaults used)
  masked: object       // All variables with sensitive values masked
}
```

**Example:**
```javascript
import { validateEnv } from './env-validator.js';

const result = validateEnv();
if (!result.valid) {
  console.error('Missing variables:', result.missing);
  process.exit(1);
}

result.warnings.forEach(w => console.warn(w));
```

**Validated Variables:**

| Variable | Required | Default | Sensitive |
|----------|----------|---------|-----------|
| `OLLAMA_HOST` | Yes | `http://localhost:11434` | No |
| `DEFAULT_MODEL` | Yes | `llama3.2:3b` | No |
| `GOOGLE_API_KEY` | No | - | Yes |
| `GEMINI_API_KEY` | No | - | Yes |
| `OPENAI_API_KEY` | No | - | Yes |
| `ANTHROPIC_API_KEY` | No | - | Yes |
| `XAI_API_KEY` | No | - | Yes |
| `DEEPSEEK_API_KEY` | No | - | Yes |
| `CACHE_ENCRYPTION_KEY` | No | - | Yes |
| `CACHE_ENABLED` | No | `true` | No |
| `CACHE_TTL` | No | `3600` | No |
| `LOG_LEVEL` | No | `info` | No |
| `NODE_ENV` | No | `development` | No |

---

### `printEnvReport()`

Prints a formatted validation report to the console.

**Parameters:** None

**Returns:** The result of `validateEnv()`

**Example:**
```javascript
import { printEnvReport } from './env-validator.js';

printEnvReport();
```

**Output:**
```
┌─────────────────────────────────────────┐
│  HYDRA Environment Validation           │
├─────────────────────────────────────────┤
│  All required variables present         │
├─────────────────────────────────────────┤
│  Warnings:                              │
│  OLLAMA_HOST not set, using default     │
├─────────────────────────────────────────┤
│  Environment Summary:                   │
│  OLLAMA_HOST          http://localhost  │
│  DEFAULT_MODEL        llama3.2:3b       │
│  GOOGLE_API_KEY       AIzaSyC1...[MASK] │
└─────────────────────────────────────────┘
```

---

### `assertEnv()`

Throws an error if required variables are missing.

**Parameters:** None

**Returns:** `true` if valid

**Throws:** `Error` if required variables are missing

**Example:**
```javascript
import { assertEnv } from './env-validator.js';

try {
  assertEnv();
  console.log('Environment OK');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
```

---

### `maskSensitive(value, showChars)`

Masks sensitive values for safe logging.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | `string` | - | The value to mask |
| `showChars` | `number` | `8` | Number of characters to show |

**Returns:** `string` - Masked value

**Example:**
```javascript
import { maskSensitive } from './env-validator.js';

const apiKey = 'sk-1234567890abcdefghij';
console.log(maskSensitive(apiKey));     // "sk-12345...[MASKED]"
console.log(maskSensitive(apiKey, 4));  // "sk-1...[MASKED]"
console.log(maskSensitive('abc'));      // "***"
```

---

## Health Check API

**Location:** `GeminiCLI/src/health.js`

Service health monitoring endpoint.

### `createHealthCheck(serverName)`

Creates a health check instance for a service.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `serverName` | `string` | `'unknown'` | Name of the server/service |

**Returns:** `HealthCheck` object

**Example:**
```javascript
import { createHealthCheck } from './health.js';

const health = createHealthCheck('MyService');
```

---

### `healthCheck.getHealth()`

Returns the current health status.

**Returns:** `object`
```javascript
{
  name: string,            // Server name
  status: string,          // 'healthy' | 'degraded' | 'unhealthy'
  uptimeSeconds: number,   // Uptime in seconds
  version: string,         // Package version
  timestamp: string,       // ISO timestamp
  memory: {
    heapUsed: number,      // Heap used in MB
    heapTotal: number,     // Heap total in MB
    unit: 'MB'
  }
}
```

**Example:**
```javascript
import { createHealthCheck } from './health.js';

const health = createHealthCheck('API-Server');

// Express endpoint
app.get('/health', (req, res) => {
  res.json(health.getHealth());
});
```

**Response:**
```json
{
  "name": "API-Server",
  "status": "healthy",
  "uptimeSeconds": 3600,
  "version": "1.0.0",
  "timestamp": "2025-01-19T10:30:00.000Z",
  "memory": {
    "heapUsed": 45,
    "heapTotal": 128,
    "unit": "MB"
  }
}
```

---

### `healthCheck.setStatus(newStatus)`

Updates the health status.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `newStatus` | `string` | New status: `'healthy'`, `'degraded'`, or `'unhealthy'` |

**Example:**
```javascript
const health = createHealthCheck('API-Server');

// Mark as degraded when database is slow
health.setStatus('degraded');

// Mark as unhealthy during shutdown
health.setStatus('unhealthy');
```

---

### `healthCheck.uptime()`

Returns the current uptime in seconds.

**Returns:** `number`

**Example:**
```javascript
console.log(`Uptime: ${health.uptime()} seconds`);
```

---

### Pre-configured Instance

```javascript
import { geminiHealth } from './health.js';

// Pre-configured for GeminiCLI-MCP
app.get('/health', (req, res) => {
  res.json(geminiHealth.getHealth());
});
```

---

## Complete Integration Example

```javascript
import express from 'express';
import { createLogger, correlationMiddleware, generateCorrelationId } from './logger.js';
import { getCache, setCache, getCacheStats } from './cache.js';
import { LRUCache } from './lru-cache.js';
import { assertEnv, printEnvReport } from './env-validator.js';
import { createHealthCheck } from './health.js';

// Validate environment at startup
printEnvReport();
assertEnv();

// Initialize components
const logger = createLogger('api');
const health = createHealthCheck('HYDRA-API');
const queryCache = new LRUCache({ maxSize: 100, ttlMs: 60000 });

const app = express();

// Middleware
app.use(correlationMiddleware);

// Health endpoint
app.get('/health', (req, res) => {
  res.json(health.getHealth());
});

// Cache stats endpoint
app.get('/cache/stats', (req, res) => {
  res.json({
    disk: getCacheStats(),
    memory: queryCache.getStats()
  });
});

// Query endpoint with caching
app.post('/query', async (req, res) => {
  const { prompt, model } = req.body;

  // Check disk cache
  const diskCached = getCache(prompt, model);
  if (diskCached) {
    logger.info('Disk cache hit', { age: diskCached.age });
    return res.json(diskCached);
  }

  // Check memory cache
  const memoryCached = queryCache.get(`${model}:${prompt}`);
  if (memoryCached) {
    logger.info('Memory cache hit');
    return res.json({ response: memoryCached, cached: true });
  }

  // Process query...
  const response = await processQuery(prompt, model);

  // Store in both caches
  setCache(prompt, response, model, 'ollama');
  queryCache.set(`${model}:${prompt}`, response);

  logger.info('Query processed', { model });
  res.json({ response, cached: false });
});

app.listen(3000, () => {
  logger.info('Server started on port 3000');
});
```

---

*Generated by HYDRA Documentation Agent (Jaskier)*
