import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const OLLAMA_URL = 'http://127.0.0.1:11434';

// Track Ollama process PID
let ollamaPid = null;

export function createHealthCheck(serverName = 'unknown') {
  const startTime = Date.now();

  return {
    name: serverName,
    status: 'healthy',
    uptime: () => Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '1.0.0',

    getHealth() {
      return {
        name: this.name,
        status: this.status,
        uptimeSeconds: this.uptime(),
        version: this.version,
        timestamp: new Date().toISOString(),
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          unit: 'MB'
        }
      };
    },

    setStatus(newStatus) {
      this.status = newStatus;
    }
  };
}

// Export singleton for GeminiCLI
export const geminiHealth = createHealthCheck('GeminiCLI-MCP');

// ============================================================================
// OLLAMA HEALTH CHECK & CONTROL
// ============================================================================

/**
 * Check if Ollama is running
 * @returns {Promise<boolean>}
 */
export async function checkOllamaRunning() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get list of installed Ollama models
 * @returns {Promise<string[]>}
 */
export async function getOllamaModels() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Ollama returned status: ${response.status}`);
    }

    const data = await response.json();
    return (data.models || []).map(m => m.name);
  } catch (error) {
    throw new Error(`Failed to get Ollama models: ${error.message}`);
  }
}

/**
 * Get detailed Ollama status
 * @returns {Promise<{isRunning: boolean, status: string, pid: number|null, modelsCount: number, message: string}>}
 */
export async function getOllamaStatus() {
  const isRunning = await checkOllamaRunning();

  if (isRunning) {
    try {
      const models = await getOllamaModels();
      return {
        isRunning: true,
        status: 'Running',
        pid: ollamaPid,
        modelsCount: models.length,
        message: `Ollama running with ${models.length} models`
      };
    } catch {
      return {
        isRunning: true,
        status: 'Running',
        pid: ollamaPid,
        modelsCount: 0,
        message: 'Ollama running (could not fetch models)'
      };
    }
  }

  return {
    isRunning: false,
    status: 'Stopped',
    pid: null,
    modelsCount: 0,
    message: 'Ollama is not running'
  };
}

/**
 * Find Ollama executable path
 * @returns {Promise<string>}
 */
async function findOllamaExecutable() {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // Common Windows paths
    const possiblePaths = [
      `${process.env.LOCALAPPDATA}\\Programs\\Ollama\\ollama.exe`,
      `${process.env.LOCALAPPDATA}\\Ollama\\ollama.exe`,
      'C:\\Program Files\\Ollama\\ollama.exe',
    ];

    for (const path of possiblePaths) {
      try {
        const { stat } = await import('fs/promises');
        await stat(path);
        return path;
      } catch {
        // Path doesn't exist, try next
      }
    }

    // Try to find via PATH
    try {
      const { stdout } = await execAsync('where ollama');
      const firstPath = stdout.split('\n')[0].trim();
      if (firstPath) return firstPath;
    } catch {
      // Not in PATH
    }
  } else {
    // Unix-like systems
    try {
      const { stdout } = await execAsync('which ollama');
      const path = stdout.trim();
      if (path) return path;
    } catch {
      // Not in PATH
    }

    // Common Unix paths
    const possiblePaths = [
      '/usr/local/bin/ollama',
      '/usr/bin/ollama',
      '/opt/ollama/ollama',
    ];

    for (const path of possiblePaths) {
      try {
        const { stat } = await import('fs/promises');
        await stat(path);
        return path;
      } catch {
        // Path doesn't exist, try next
      }
    }
  }

  throw new Error('Ollama executable not found. Please install Ollama from https://ollama.ai');
}

/**
 * Start Ollama service
 * @returns {Promise<{success: boolean, pid?: number, error?: string}>}
 */
export async function startOllama() {
  // Check if already running
  if (await checkOllamaRunning()) {
    return { success: false, error: 'Ollama is already running' };
  }

  try {
    const ollamaPath = await findOllamaExecutable();

    // Spawn Ollama in detached mode
    const child = spawn(ollamaPath, ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });

    child.unref();
    ollamaPid = child.pid;

    // Wait for Ollama to start (poll with timeout)
    const maxWait = 10;
    for (let i = 0; i < maxWait; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (await checkOllamaRunning()) {
        return { success: true, pid: ollamaPid };
      }
    }

    return { success: false, error: 'Ollama started but not responding after 10 seconds' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Stop Ollama service
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function stopOllama() {
  // Check if running
  if (!(await checkOllamaRunning())) {
    ollamaPid = null;
    return { success: true }; // Already stopped
  }

  const isWindows = process.platform === 'win32';

  try {
    if (ollamaPid) {
      // Kill by PID if we know it
      if (isWindows) {
        await execAsync(`taskkill /PID ${ollamaPid} /F`);
      } else {
        await execAsync(`kill -15 ${ollamaPid}`);
      }
    } else {
      // Kill by process name
      if (isWindows) {
        await execAsync('taskkill /IM ollama.exe /F');
      } else {
        await execAsync('pkill -f ollama');
      }
    }

    // Wait for shutdown
    const maxWait = 5;
    for (let i = 0; i < maxWait; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!(await checkOllamaRunning())) {
        ollamaPid = null;
        return { success: true };
      }
    }

    // Force kill if still running
    if (isWindows) {
      await execAsync('taskkill /IM ollama.exe /F /T');
    } else {
      await execAsync('pkill -9 -f ollama');
    }

    ollamaPid = null;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Restart Ollama service
 * @returns {Promise<{success: boolean, pid?: number, error?: string}>}
 */
export async function restartOllama() {
  // Stop first if running
  if (await checkOllamaRunning()) {
    const stopResult = await stopOllama();
    if (!stopResult.success) {
      return { success: false, error: `Failed to stop Ollama: ${stopResult.error}` };
    }
    // Wait a bit for clean shutdown
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Start again
  return startOllama();
}