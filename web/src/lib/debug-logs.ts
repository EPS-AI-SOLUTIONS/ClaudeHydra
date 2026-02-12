/**
 * In-memory debug log buffer.
 * Survives hot-reload via globalThis pattern.
 */

export interface DebugLogEntry {
  level: string;
  message: string;
  timestamp: string;
}

const globalLogs: DebugLogEntry[] = ((globalThis as any).__hydraDebugLogs ??= []);

export function addDebugLog(level: string, message: string) {
  globalLogs.push({
    level,
    message,
    timestamp: new Date().toISOString(),
  });
  // Keep last 500 entries
  if (globalLogs.length > 500) globalLogs.splice(0, globalLogs.length - 500);
}

export function getDebugLogs(limit = 100): DebugLogEntry[] {
  return globalLogs.slice(-limit);
}

export function clearDebugLogs() {
  globalLogs.length = 0;
}
