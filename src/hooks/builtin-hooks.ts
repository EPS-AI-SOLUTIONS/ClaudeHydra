/**
 * Built-in Hooks
 *
 * Pre-defined hook handlers for common operations.
 *
 * @module src/hooks/builtin-hooks
 */

// ============================================================================
// Session Hooks
// ============================================================================

/**
 * Load project context on session start
 *
 * @param {Object} context - Hook context
 * @returns {Promise<Object>}
 */
export async function loadProjectContext(_context) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const projectContext = {
    cwd: process.cwd(),
    files: {},
    loaded: [],
  };

  // Try to load common context files
  const contextFiles = ['CLAUDE.md', 'README.md', '.hydra/context.md', 'package.json'];

  for (const file of contextFiles) {
    try {
      const filePath = path.join(process.cwd(), file);
      const content = await fs.readFile(filePath, 'utf-8');
      projectContext.files[file] = content;
      projectContext.loaded.push(file);
    } catch {
      // File not found, skip
    }
  }

  return {
    success: true,
    context: projectContext,
    message: `Loaded ${projectContext.loaded.length} context files`,
  };
}

/**
 * Check MCP server health on session start
 *
 * @param {Object} context - Hook context
 * @returns {Promise<Object>}
 */
export async function checkMCPHealth(_context) {
  const results = {
    servers: {},
    healthy: 0,
    unhealthy: 0,
    total: 0,
  };

  try {
    // Try to import MCP client manager
    const { getMCPClientManager } = await import('../mcp/client-manager.js');
    const manager = getMCPClientManager();

    if (!manager.initialized) {
      return {
        success: true,
        skipped: true,
        message: 'MCP not initialized yet',
      };
    }

    const healthSummary = manager.getHealthSummary();

    results.servers = healthSummary.servers || {};
    results.healthy = healthSummary.healthy || 0;
    results.unhealthy = healthSummary.unhealthy || 0;
    results.total = healthSummary.total || 0;

    return {
      success: true,
      results,
      message: `MCP Health: ${results.healthy}/${results.total} healthy`,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: 'Failed to check MCP health',
    };
  }
}

// ============================================================================
// Tool Use Hooks
// ============================================================================

/**
 * Security audit before tool execution
 *
 * @param {Object} context - Hook context
 * @param {string} context.toolName - Tool being called
 * @param {Object} context.args - Tool arguments
 * @returns {Promise<Object>}
 */
export async function securityAudit(context) {
  const { toolName, args } = context;
  const warnings = [];
  const blocked = [];

  // Check for dangerous patterns in arguments
  const dangerousPatterns = [
    { pattern: /rm\s+-rf\s+\//, message: 'Destructive file operation detected' },
    { pattern: /sudo\s+/, message: 'Sudo command detected' },
    { pattern: /chmod\s+777/, message: 'Insecure permission change' },
    { pattern: /\|\s*bash/, message: 'Piped bash execution' },
    { pattern: /curl.*\|\s*sh/, message: 'Remote script execution' },
    { pattern: /eval\s*\(/, message: 'Eval execution detected' },
  ];

  // Convert args to string for pattern matching
  const argsString = JSON.stringify(args);

  for (const { pattern, message } of dangerousPatterns) {
    if (pattern.test(argsString)) {
      warnings.push(message);
    }
  }

  // Check specific tools
  const blockedTools = ['system_exec', 'raw_shell'];
  if (blockedTools.includes(toolName)) {
    blocked.push(`Tool '${toolName}' is blocked`);
  }

  // Check file paths for sensitive locations
  const sensitivePatterns = [
    /\/etc\/(passwd|shadow|sudoers)/,
    /\.ssh\/id_/,
    /\.env/,
    /credentials/i,
    /secrets/i,
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(argsString)) {
      warnings.push(`Access to sensitive path detected`);
      break;
    }
  }

  return {
    success: blocked.length === 0,
    blocked: blocked.length > 0,
    warnings,
    blockedReasons: blocked,
    message: blocked.length > 0 ? `Blocked: ${blocked.join(', ')}` : 'Security check passed',
  };
}

/**
 * Rate limiting for tool execution
 *
 * @param {Object} context - Hook context
 * @returns {Promise<Object>}
 */
const rateLimitState = {
  counts: new Map(),
  windowStart: Date.now(),
};

export async function rateLimit(context) {
  const { toolName } = context;
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  const maxRequests = 100; // Max requests per window

  // Reset window if needed
  if (now - rateLimitState.windowStart > windowMs) {
    rateLimitState.counts.clear();
    rateLimitState.windowStart = now;
  }

  // Get current count
  const currentCount = rateLimitState.counts.get(toolName) || 0;

  if (currentCount >= maxRequests) {
    return {
      success: false,
      blocked: true,
      message: `Rate limit exceeded for tool: ${toolName}`,
      retryAfter: windowMs - (now - rateLimitState.windowStart),
    };
  }

  // Increment count
  rateLimitState.counts.set(toolName, currentCount + 1);

  return {
    success: true,
    currentCount: currentCount + 1,
    maxRequests,
    remaining: maxRequests - currentCount - 1,
  };
}

// ============================================================================
// Post-Tool Hooks
// ============================================================================

/**
 * Log tool execution
 *
 * @param {Object} context - Hook context
 * @returns {Promise<Object>}
 */
export async function logToolExecution(context) {
  const { toolName, args, result, duration, success } = context;

  const logEntry = {
    timestamp: new Date().toISOString(),
    tool: toolName,
    args: sanitizeArgs(args),
    success,
    duration,
    resultSize: JSON.stringify(result || {}).length,
  };

  // Log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Tool] ${toolName}: ${success ? 'OK' : 'FAIL'} (${duration}ms)`);
  }

  // Could also write to file or send to telemetry
  return {
    success: true,
    logged: true,
    entry: logEntry,
  };
}

/**
 * Sanitize arguments for logging (remove sensitive data)
 *
 * @param {Object} args - Arguments to sanitize
 * @returns {Object}
 */
function sanitizeArgs(args) {
  if (!args || typeof args !== 'object') {
    return args;
  }

  const sanitized = { ...args };
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential', 'auth'];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}

// ============================================================================
// Failure Recovery Hooks
// ============================================================================

/**
 * Attempt recovery from tool failure
 *
 * @param {Object} context - Hook context
 * @returns {Promise<Object>}
 */
export async function attemptRecovery(context) {
  const { toolName, error, retryCount = 0 } = context;
  const maxRetries = 3;

  if (retryCount >= maxRetries) {
    return {
      success: false,
      shouldRetry: false,
      message: `Max retries (${maxRetries}) exceeded for ${toolName}`,
    };
  }

  // Determine if error is recoverable
  const recoverablePatterns = [
    { pattern: /ECONNRESET|ETIMEDOUT|ECONNREFUSED/, action: 'retry', delay: 1000 },
    { pattern: /rate.?limit/i, action: 'retry', delay: 5000 },
    { pattern: /503|502|504/, action: 'retry', delay: 2000 },
    { pattern: /ENOENT/, action: 'skip', message: 'Resource not found' },
    { pattern: /EACCES|EPERM/, action: 'fail', message: 'Permission denied' },
  ];

  const errorString = error?.message || String(error);

  for (const { pattern, action, delay, message } of recoverablePatterns) {
    if (pattern.test(errorString)) {
      switch (action) {
        case 'retry':
          return {
            success: true,
            shouldRetry: true,
            delay,
            retryCount: retryCount + 1,
            message: `Will retry after ${delay}ms`,
          };

        case 'skip':
          return {
            success: true,
            shouldRetry: false,
            skip: true,
            message,
          };

        case 'fail':
          return {
            success: false,
            shouldRetry: false,
            message,
          };
      }
    }
  }

  // Unknown error - don't retry
  return {
    success: false,
    shouldRetry: false,
    message: 'Unknown error, not retrying',
  };
}

// ============================================================================
// Plan Phase Hooks
// ============================================================================

/**
 * Pre-plan phase validation
 *
 * @param {Object} context - Hook context
 * @returns {Promise<Object>}
 */
export async function validatePlanPhase(context) {
  const { phase, plan } = context;

  // Validate phase requirements
  const validations = {
    speculate: () => !!plan.query,
    plan: () => !!plan.phases?.speculate?.output,
    execute: () => !!plan.phases?.plan?.output?.tasks,
    synthesize: () => !!plan.phases?.execute?.output,
    log: () => !!plan.phases?.synthesize?.output,
  };

  const validator = validations[phase];
  if (validator && !validator()) {
    return {
      success: false,
      message: `Prerequisites not met for phase: ${phase}`,
    };
  }

  return {
    success: true,
    message: `Phase ${phase} validated`,
  };
}

/**
 * Post-plan phase logging
 *
 * @param {Object} context - Hook context
 * @returns {Promise<Object>}
 */
export async function logPlanPhase(context) {
  const { phase, plan, output, duration } = context;

  const logEntry = {
    timestamp: new Date().toISOString(),
    planId: plan.id,
    phase,
    duration,
    outputSize: JSON.stringify(output || {}).length,
  };

  console.log(`[Plan] Phase ${phase} completed in ${duration}ms`);

  return {
    success: true,
    logged: true,
    entry: logEntry,
  };
}

// ============================================================================
// Session End Hooks
// ============================================================================

/**
 * Cleanup on session end
 *
 * @param {Object} context - Hook context
 * @returns {Promise<Object>}
 */
export async function cleanupSession(_context) {
  const actions = [];

  try {
    // Archive completed todos
    const { getTodoManager } = await import('../tasks/todo-manager.js');
    const todoManager = getTodoManager();
    const archived = await todoManager.archiveCompleted();
    if (archived > 0) {
      actions.push(`Archived ${archived} completed todos`);
    }
  } catch {
    // Ignore if tasks module not available
  }

  try {
    // Cleanup old plans
    const { getPlanStorage } = await import('../planning/plan-storage.js');
    const planStorage = getPlanStorage();
    const cleaned = await planStorage.cleanup(7); // Clean plans older than 7 days
    if (cleaned > 0) {
      actions.push(`Cleaned ${cleaned} old plans`);
    }
  } catch {
    // Ignore if planning module not available
  }

  return {
    success: true,
    actions,
    message: actions.length > 0 ? actions.join(', ') : 'No cleanup needed',
  };
}

// ============================================================================
// Hook Registry
// ============================================================================

/**
 * Built-in hook handlers registry
 */
export const BUILTIN_HOOKS = {
  // Session hooks
  loadProjectContext,
  checkMCPHealth,
  cleanupSession,

  // Tool use hooks
  securityAudit,
  rateLimit,
  logToolExecution,

  // Failure hooks
  attemptRecovery,

  // Plan phase hooks
  validatePlanPhase,
  logPlanPhase,
};

/**
 * Get built-in hook by name
 *
 * @param {string} name - Hook name
 * @returns {Function | null}
 */
export function getBuiltinHook(name) {
  return BUILTIN_HOOKS[name] || null;
}

export default BUILTIN_HOOKS;
