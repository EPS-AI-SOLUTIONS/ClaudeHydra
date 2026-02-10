/**
 * ClaudeHydra - Claude Client via Claude Agent SDK
 * Uses Claude Code's billing (Max plan) instead of direct API key.
 *
 * IMPORTANT: The spawn interceptor strips ANTHROPIC_API_KEY from subprocess env
 * so that Claude Code uses the logged-in session (Max plan billing) rather than
 * the API key's credit balance. Without this, dotenv loads ANTHROPIC_API_KEY
 * into process.env and Claude Code subprocess picks it up, billing against API
 * credits instead of the Max plan.
 *
 * @module hydra/providers/claude-client
 */

import { type ChildProcess as _ChildProcess, spawn as _nodeSpawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { Transform as _Transform } from 'node:stream';
import type { SDKResultError, SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('claude-client');

/** Temporary crash debug: always write to file so we can diagnose TTY-specific crashes */
import { resolve as _resolvePath } from 'node:path';

const _CRASH_LOG = _resolvePath(process.cwd(), '_sdk-debug.log');
function _crashLog(msg: string) {
  try {
    appendFileSync(_CRASH_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}
_crashLog(
  `=== claude-client loaded | pid=${process.pid} stdin.isTTY=${process.stdin.isTTY} stdout.isTTY=${process.stdout.isTTY} ===`,
);

/**
 * Custom spawn interceptor for SDK subprocess.
 * 1. Cleans environment (strips FORCE_COLOR, etc.) to prevent subprocess interference
 * 2. Explicitly sets cwd to prevent undefined cwd issues
 * 3. Captures exact args, env, and all raw output for crash diagnosis
 *
 * Exported for use by ClaudeCodeInstance (multi-instance pool).
 */
export function createSpawnInterceptor() {
  return (options: any) => {
    // Clean env: strip vars that could interfere with subprocess JSON protocol
    const cleanEnv = { ...options.env };
    // FORCE_COLOR can cause colored output to mix with stream-json on stdout
    delete cleanEnv.FORCE_COLOR;
    // NODE_OPTIONS might inject loaders/hooks that break the subprocess
    delete cleanEnv.NODE_OPTIONS;
    // DEBUG can cause extra output on stdout
    delete cleanEnv.DEBUG;

    // CRITICAL: Remove API keys so Claude Code subprocess uses logged-in session
    // (Claude Max plan billing) instead of direct API key billing.
    // When ANTHROPIC_API_KEY is in env, Claude Code uses it and bills against
    // the API key's credit balance — which may be empty.
    // Without it, Claude Code falls back to the authenticated Max plan session.
    delete cleanEnv.ANTHROPIC_API_KEY;
    delete cleanEnv.CLAUDE_API_KEY;

    const effectiveCwd = options.cwd || process.cwd();

    _crashLog(`SPAWN_INTERCEPT: command=${options.command}`);
    _crashLog(`SPAWN_INTERCEPT: args=${JSON.stringify(options.args)}`);
    _crashLog(`SPAWN_INTERCEPT: cwd=${effectiveCwd} (original: ${options.cwd})`);
    _crashLog(`SPAWN_INTERCEPT: env.SHELL=${cleanEnv.SHELL}`);
    _crashLog(`SPAWN_INTERCEPT: env.FORCE_COLOR=${cleanEnv.FORCE_COLOR} (stripped)`);
    _crashLog(`SPAWN_INTERCEPT: env.NODE_OPTIONS=${cleanEnv.NODE_OPTIONS} (stripped)`);
    _crashLog(
      `SPAWN_INTERCEPT: env.ANTHROPIC_API_KEY=${cleanEnv.ANTHROPIC_API_KEY} (stripped → use Max plan session)`,
    );
    _crashLog(
      `SPAWN_INTERCEPT: env.CLAUDE_API_KEY=${cleanEnv.CLAUDE_API_KEY} (stripped → use Max plan session)`,
    );
    _crashLog(`SPAWN_INTERCEPT: env.CLAUDE_CODE_ENTRYPOINT=${cleanEnv.CLAUDE_CODE_ENTRYPOINT}`);

    const child: _ChildProcess = _nodeSpawn(options.command, options.args, {
      cwd: effectiveCwd,
      env: cleanEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    child.stderr?.on('data', (data: Buffer) => {
      _crashLog(`SPAWN_RAW_STDERR: ${data.toString().trim().substring(0, 2000)}`);
    });

    child.on('exit', (code: number | null, signal: string | null) => {
      _crashLog(`SPAWN_EXIT: code=${code} signal=${signal}`);
    });

    child.on('error', (err: Error) => {
      _crashLog(`SPAWN_ERROR: ${err.message}`);
    });

    // Use Transform to log stdout data as it passes through to SDK
    const loggedStdout = new _Transform({
      transform(chunk, _encoding, callback) {
        const str = chunk.toString().trim();
        _crashLog(`SPAWN_RAW_STDOUT: ${str.substring(0, 2000)}`);
        callback(null, chunk); // pass data through unchanged
      },
    });
    child.stdout?.pipe(loggedStdout);

    // Monkey-patch stdin.write to log what SDK sends to subprocess
    const stdinRef = child.stdin!;
    const origWrite = stdinRef.write.bind(stdinRef);
    (stdinRef as any).write = (chunk: any, ...args: any[]) => {
      try {
        const str = typeof chunk === 'string' ? chunk : chunk?.toString?.() || '';
        _crashLog(`SPAWN_STDIN_WRITE: ${str.trim().substring(0, 2000)}`);
      } catch {}
      return origWrite(chunk, ...args);
    };

    return {
      stdin: stdinRef,
      stdout: loggedStdout,
      get killed() {
        return child.killed;
      },
      get exitCode() {
        return child.exitCode;
      },
      kill: child.kill.bind(child),
      on: child.on.bind(child),
      once: child.once.bind(child),
      off: child.off.bind(child),
    };
  };
}

/**
 * SDK error diagnosis result
 */
interface SDKDiagnosis {
  errorType:
    | 'auth'
    | 'not_installed'
    | 'model_unavailable'
    | 'billing'
    | 'crash'
    | 'timeout'
    | 'max_turns'
    | 'unknown';
  suggestions: string[];
  stderrOutput?: string;
}

/**
 * Track whether we've already had a crash — enables debug on subsequent calls.
 */
let _debugAfterCrash = false;

/**
 * Collect environment diagnostics for crash reports.
 */
function collectEnvDiagnostics(): Record<string, string | undefined> {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY ? '(set)' : '(not set)',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '(set)' : '(not set)',
    CLAUDE_CODE_PATH: process.env.CLAUDE_CODE_PATH || '(not set)',
    PATH_length: `${(process.env.PATH || '').length} chars`,
  };
}

/**
 * Diagnose Claude SDK errors based on error message and stderr output.
 * Classifies the error and provides actionable suggestions.
 */
export function diagnoseSDKError(errorMessage: string, stderrOutput?: string): SDKDiagnosis {
  const combined = `${errorMessage}\n${stderrOutput || ''}`.toLowerCase();

  // Pattern: Claude Code not installed or not found
  if (
    combined.includes('enoent') ||
    combined.includes('not found') ||
    combined.includes('spawn') ||
    combined.includes('no such file')
  ) {
    return {
      errorType: 'not_installed',
      suggestions: [
        'Zainstaluj Claude Code: npm install -g @anthropic-ai/claude-code',
        'Sprawdź czy "claude" jest dostępny w PATH: claude --version',
        'Na Windows: sprawdź zmienną środowiskową PATH',
        'Alternatywnie: ustaw CLAUDE_CODE_PATH na pełną ścieżkę do executable',
      ],
      stderrOutput,
    };
  }

  // Pattern: Authentication / login issues
  if (
    combined.includes('auth') ||
    combined.includes('login') ||
    combined.includes('401') ||
    combined.includes('unauthorized') ||
    combined.includes('not logged in') ||
    combined.includes('session expired')
  ) {
    return {
      errorType: 'auth',
      suggestions: [
        'Zaloguj się do Claude Code: claude login',
        'Sprawdź aktywną subskrypcję Claude Max/Pro w ustawieniach konta',
        'Jeśli używasz tokena: sprawdź zmienną CLAUDE_API_KEY',
        'Uruchom diagnostykę: pnpm start -- --diagnose',
      ],
      stderrOutput,
    };
  }

  // Pattern: Model not available
  if (
    (combined.includes('model') &&
      (combined.includes('not available') ||
        combined.includes('not found') ||
        combined.includes('unavailable'))) ||
    combined.includes('does not have access')
  ) {
    return {
      errorType: 'model_unavailable',
      suggestions: [
        'Sprawdź dostępne modele: claude models',
        'Twój plan może nie obsługiwać tego modelu (Opus wymaga Max planu)',
        'Spróbuj z innym modelem: /agent sonnet lub zmień MODEL_TIER w konfiguracji',
      ],
      stderrOutput,
    };
  }

  // Pattern: Billing / quota / rate limit
  if (
    combined.includes('billing') ||
    combined.includes('quota') ||
    combined.includes('rate limit') ||
    combined.includes('429') ||
    combined.includes('insufficient') ||
    combined.includes('credit')
  ) {
    const isApiKeyBilling = combined.includes('credit balance');
    return {
      errorType: 'billing',
      suggestions: [
        ...(isApiKeyBilling
          ? [
              '💳 Wyczerpane kredyty API — ClaudeHydra automatycznie przełącza na plan Max',
              'Upewnij się, że Claude Code jest zalogowany: claude login',
              'Jeśli masz plan Max/Pro, usuń ANTHROPIC_API_KEY z pliku .env',
            ]
          : []),
        'Sprawdź stan konta i limity na console.anthropic.com',
        'Rate limit: odczekaj kilka minut i spróbuj ponownie',
        'Rozważ upgrade planu Claude Max dla wyższych limitów',
      ],
      stderrOutput,
    };
  }

  // Pattern: Process crashed (exit code)
  if (
    combined.includes('exited with code') ||
    combined.includes('exit code') ||
    combined.includes('crashed') ||
    combined.includes('signal')
  ) {
    const env = collectEnvDiagnostics();
    const exitCodeMatch = combined.match(/exited with code (\d+)/);
    const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : null;

    const suggestions = [`Claude Code subprocess padł (exit code: ${exitCode ?? '?'})`];

    // Exit code 1 without stderr — most likely auth or init failure
    if (exitCode === 1 && !stderrOutput) {
      suggestions.push(
        '⚠ Exit code 1 bez stderr — prawdopodobnie: brak loginu, wygasła sesja, lub brak uprawnień do modelu',
        'Uruchom: claude login (zaloguj się ponownie)',
        'Sprawdź: claude --version && claude models (lista dostępnych modeli)',
        'Sprawdź subskrypcję: Opus wymaga planu Max',
      );
    } else {
      suggestions.push(
        'Sprawdź wersję Claude Code: claude --version',
        'Włącz debug: CLAUDE_SDK_DEBUG=1 pnpm start',
      );
    }

    if (stderrOutput) {
      suggestions.push('Stderr z subprocess został przechwycony — sprawdź szczegóły poniżej');
    }

    // Append debug retry hint if not yet in debug mode
    if (!_debugAfterCrash) {
      suggestions.push('Automatyczny retry z debug=true nastąpi przy następnym wywołaniu');
    }

    suggestions.push(
      `Env: Node ${env.nodeVersion}, ${env.platform}/${env.arch}`,
      `API keys: CLAUDE_API_KEY=${env.CLAUDE_API_KEY}, ANTHROPIC_API_KEY=${env.ANTHROPIC_API_KEY}`,
    );

    return {
      errorType: 'crash',
      suggestions,
      stderrOutput,
    };
  }

  // Pattern: Max turns exhausted (SDK agentic loop hit turn limit)
  if (combined.includes('error_max_turns') || combined.includes('max_turns')) {
    return {
      errorType: 'max_turns',
      suggestions: [
        'Agent wyczerpał limit kroków (maxTurns)',
        'Zadanie było zbyt złożone lub agent napotkał powtarzające się błędy',
        'Spróbuj uprościć zadanie lub podzielić je na mniejsze kroki',
        'Zwiększ limit: maxTurns w konfiguracji agentic (domyślnie: 25)',
      ],
      stderrOutput,
    };
  }

  // Pattern: Timeout
  if (
    combined.includes('timeout') ||
    combined.includes('abort') ||
    combined.includes('timed out')
  ) {
    return {
      errorType: 'timeout',
      suggestions: [
        'Zapytanie przekroczyło limit czasu',
        'Spróbuj krótszego/prostszego promptu',
        'Zwiększ timeout w konfiguracji (domyślnie 60s)',
      ],
      stderrOutput,
    };
  }

  // Fallback: unknown
  return {
    errorType: 'unknown',
    suggestions: [
      'Nierozpoznany błąd Claude SDK',
      'Włącz debug: CLAUDE_SDK_DEBUG=1 pnpm start',
      'Sprawdź logi: CLAUDE_SDK_DEBUG_FILE=sdk-debug.log pnpm start',
      'Uruchom diagnostykę: pnpm start -- --diagnose',
      'Zgłoś problem z pełnym stderr: github.com/anthropics/claude-code/issues',
    ],
    stderrOutput,
  };
}

/**
 * Claude model configurations
 */
export const CLAUDE_MODELS = {
  'claude-opus': {
    id: 'claude-opus-4-20250514',
    displayName: 'Claude Opus 4',
    tier: 'commander',
    maxTokens: 16384,
  },
  'claude-sonnet': {
    id: 'claude-sonnet-4-5-20250929',
    displayName: 'Claude Sonnet 4.5',
    tier: 'coordinator',
    maxTokens: 8192,
  },
};

/**
 * Direct model ID mapping (used by AgentRouter MODEL_TIER)
 */
export const DIRECT_MODEL_MAP = {
  'claude-opus-4-20250514': 'claude-opus',
  'claude-sonnet-4-5-20250929': 'claude-sonnet',
  // Backward compat alias
  'claude-opus-4-6': 'claude-opus',
};

/**
 * Default model aliases
 */
export const MODEL_ALIASES = {
  opus: 'claude-opus',
  sonnet: 'claude-sonnet',
  commander: 'claude-opus',
  coordinator: 'claude-sonnet',
};

/**
 * Resolve model name to actual model ID
 */
export function resolveModel(model) {
  if (MODEL_ALIASES[model]) {
    model = MODEL_ALIASES[model];
  }
  if (DIRECT_MODEL_MAP[model]) {
    model = DIRECT_MODEL_MAP[model];
  }
  if (CLAUDE_MODELS[model]) {
    return CLAUDE_MODELS[model].id;
  }
  return model;
}

/**
 * Check if a model ID refers to a Claude cloud model
 */
export function isClaudeModel(model) {
  return model?.startsWith('claude-') || !!MODEL_ALIASES[model] || !!DIRECT_MODEL_MAP[model];
}

/**
 * Get model configuration
 */
export function getModelConfig(model) {
  if (MODEL_ALIASES[model]) {
    model = MODEL_ALIASES[model];
  }
  return CLAUDE_MODELS[model] || null;
}

/**
 * Execute a single SDK call with given options.
 * Separated from generate() to enable debug retry and multi-instance reuse.
 *
 * Exported for use by ClaudeCodeInstance (multi-instance pool).
 */
export async function executeSdkCall(
  prompt: string,
  modelId: string,
  options: any,
  sdkExtraOptions: any = {},
) {
  const {
    system,
    timeout = 300_000, // 5 minutes default — multi-turn tasks (reporemix etc.) need time
    onSdkMessage, // Optional callback for live preview of SDK messages
  } = options;

  const startTime = Date.now();
  const stderrLines: string[] = [];
  let claudeCodeVersion: string | undefined;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Determine if debug should be forced (after previous crash or env var)
    const forceDebug = _debugAfterCrash || !!process.env.CLAUDE_SDK_DEBUG;

    const sdkOptions: any = {
      model: modelId,
      maxTurns: options.maxTurns ?? 1,

      // NOTE: SDK QueryOptions.tools expects string[] (tool name filter) or
      // { type: 'preset', preset: 'claude_code' }, NOT tool definition objects.
      // Claude Code subprocess has its own built-in tools (Read, Write, Bash, etc.).
      // Passing tool definition objects here causes subprocess crash (exit code 1).
      // Do NOT pass options.tools here — they are custom definitions, not SDK filters.

      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      abortController: controller,
      persistSession: false,

      // CRITICAL: Prevent subprocess from loading user/project settings
      // which would try to connect 20+ MCP servers and cause exit code 1 crashes
      settingSources: [],

      // Capture stderr from Claude Code subprocess — always log on debug
      stderr: (data: string) => {
        stderrLines.push(data);
        _crashLog(`stderr: ${data.trim()}`);
        if (forceDebug || process.env.DEBUG) {
          logger.debug(`[SDK stderr] ${data.trim()}`);
        }
      },

      // Enable debug when forced or via env
      ...(forceDebug ? { debug: true } : {}),
      ...(process.env.CLAUDE_SDK_DEBUG_FILE
        ? { debugFile: process.env.CLAUDE_SDK_DEBUG_FILE }
        : {}),

      // DIAGNOSTIC: Intercept subprocess spawn to capture exact args and stderr
      // This is TEMPORARY — remove after fixing the exit code 1 crash
      spawnClaudeCodeProcess: createSpawnInterceptor(),

      // Merge any extra options (e.g. from debug retry)
      ...sdkExtraOptions,
    };

    if (system) {
      sdkOptions.systemPrompt = system;
    }

    if (forceDebug && _debugAfterCrash) {
      logger.info('Debug mode auto-enabled after previous crash (debug retry)');
    }

    let resultMessage: SDKResultSuccess | SDKResultError | null = null;

    _crashLog(
      `executeSdkCall: before sdkQuery() | model=${modelId} maxTurns=${sdkOptions.maxTurns} settingSources=${JSON.stringify(sdkOptions.settingSources)} debug=${sdkOptions.debug} tools=${JSON.stringify(sdkOptions.tools)} stdin.isTTY=${process.stdin.isTTY} stdout.isTTY=${process.stdout.isTTY}`,
    );

    for await (const message of sdkQuery({ prompt, options: sdkOptions })) {
      _crashLog(
        `executeSdkCall: SDK msg type=${message.type} subtype=${(message as any).subtype || 'none'}`,
      );

      // Emit live preview callback for UI
      if (onSdkMessage) {
        try {
          onSdkMessage(message);
        } catch {}
      }

      // Capture Claude Code version from system/init message
      if (message.type === 'system' && (message as any).subtype === 'init') {
        claudeCodeVersion =
          (message as any).claude_code_version || (message as any).claudeCodeVersion;
        logger.debug(`Claude Code version: ${claudeCodeVersion}`);
      }

      if (message.type === 'result') {
        resultMessage = message as SDKResultSuccess | SDKResultError;
      }
    }

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    const stderrOutput = stderrLines.length > 0 ? stderrLines.join('\n') : undefined;

    _crashLog(
      `executeSdkCall: completed | duration=${duration}ms stderrLines=${stderrLines.length} resultType=${resultMessage?.type} resultSubtype=${(resultMessage as any)?.subtype}`,
    );
    return { resultMessage, duration, stderrLines, stderrOutput, claudeCodeVersion, modelId };
  } catch (error) {
    _crashLog(
      `executeSdkCall: CAUGHT ERROR | ${(error as any).message} | stderrLines=${stderrLines.length} | stderrJoined=${stderrLines.join(' | ').substring(0, 500)}`,
    );
    const duration = Date.now() - startTime;
    const stderrOutput = stderrLines.length > 0 ? stderrLines.join('\n') : undefined;
    return { error, duration, stderrLines, stderrOutput, claudeCodeVersion, modelId };
  }
}

/**
 * Generate completion using Claude Agent SDK.
 * Routes through Claude Code's billing (Max plan).
 *
 * When options.instanceManager is provided and enabled, delegates to the
 * multi-instance pool for concurrent execution. Otherwise uses legacy
 * single-subprocess behavior (backward compatible).
 *
 * On first crash (exit code 1), automatically retries once with debug=true
 * to capture verbose stderr for diagnostics.
 */
export async function generate(prompt, options: any = {}) {
  const {
    model = 'claude-sonnet',
    system,
    maxTokens = 4096,
    temperature = 0.7,
    timeout = 300_000, // 5 min default — multi-turn agentic tasks need time
  } = options;

  // --- Multi-instance path: delegate to pool if available ---
  if (options.instanceManager?.isEnabled && options.instanceManager.isInitialized) {
    return options.instanceManager.executeTask(prompt, {
      model,
      system,
      maxTokens,
      temperature,
      timeout,
      agent: options.agent,
      priority: options.priority,
      onSdkMessage: options.onSdkMessage,
      maxTurns: options.maxTurns,
    });
  }

  const modelId = resolveModel(model);

  // --- Legacy single-subprocess path ---
  let result = await executeSdkCall(prompt, modelId, options);

  // --- Handle thrown errors ---
  if (result.error) {
    const { error, duration, stderrOutput } = result;

    if (error.name === 'AbortError') {
      const diagnosis = diagnoseSDKError('Request timeout / abort', stderrOutput);
      return {
        success: false,
        error: 'Request timeout',
        errorType: diagnosis.errorType,
        suggestions: diagnosis.suggestions,
        stderrOutput,
        model: modelId,
        duration_ms: duration,
      };
    }

    const diagnosis = diagnoseSDKError(error.message || 'Unknown error', stderrOutput);
    const isCrashWithoutStderr = diagnosis.errorType === 'crash' && !stderrOutput;

    // --- Debug retry: on first crash without stderr, retry with debug=true ---
    if (isCrashWithoutStderr && !_debugAfterCrash) {
      _debugAfterCrash = true;
      logger.warn(
        'Crash without stderr detected — retrying with debug=true to capture diagnostics...',
      );

      const retryResult = await executeSdkCall(prompt, modelId, options, { debug: true });

      if (retryResult.error) {
        const retryStderr = retryResult.stderrOutput;
        const retryDiagnosis = diagnoseSDKError(
          retryResult.error.message || 'Unknown error',
          retryStderr,
        );

        logger.error('Claude SDK error (debug retry)', {
          message: retryResult.error.message,
          name: retryResult.error.name,
          errorType: retryDiagnosis.errorType,
          stderrLines: retryResult.stderrLines.length,
          stderrPreview: retryStderr?.slice(0, 500),
          duration: retryResult.duration,
          modelId,
          env: collectEnvDiagnostics(),
        });

        return {
          success: false,
          error: retryResult.error.message || 'Unknown error',
          errorType: retryDiagnosis.errorType,
          suggestions: retryDiagnosis.suggestions,
          stderrOutput: retryStderr,
          model: modelId,
          duration_ms: result.duration + retryResult.duration,
          debugRetry: true,
        };
      }

      // Debug retry succeeded — process the result below
      result = retryResult;
    } else {
      // No retry — log and return error
      logger.error('Claude SDK error', {
        message: error.message,
        name: error.name,
        code: error.code,
        errorType: diagnosis.errorType,
        stderrLines: result.stderrLines.length,
        stderrPreview: stderrOutput?.slice(0, 500),
        duration,
        modelId,
        promptLength: prompt?.length,
        env: collectEnvDiagnostics(),
      });

      return {
        success: false,
        error: error.message || 'Unknown error',
        errorType: diagnosis.errorType,
        suggestions: diagnosis.suggestions,
        stderrOutput,
        model: modelId,
        duration_ms: duration,
      };
    }
  }

  // --- Process successful SDK call result ---
  const { resultMessage, duration, stderrOutput, claudeCodeVersion } = result;

  if (resultMessage && resultMessage.subtype === 'success') {
    const success = resultMessage as SDKResultSuccess;

    // IMPORTANT: SDK can return subtype='success' with is_error=true for API-level errors
    // like billing_error ("Credit balance is too low"). Check is_error flag!
    if (success.is_error) {
      const errorText = success.result || 'Unknown API error';
      const diagnosis = diagnoseSDKError(errorText, stderrOutput);

      _crashLog(
        `generate: result subtype=success but is_error=true | errorText=${errorText} | diagnosed=${diagnosis.errorType}`,
      );
      logger.warn(`Claude SDK returned error result: ${errorText} (type: ${diagnosis.errorType})`);

      return {
        success: false,
        error: errorText,
        errorType: diagnosis.errorType,
        suggestions: diagnosis.suggestions,
        stderrOutput,
        model: modelId,
        duration_ms: duration,
        claudeCodeVersion,
      };
    }

    // Genuine success — reset crash flag
    _debugAfterCrash = false;

    return {
      success: true,
      content: success.result,
      model: modelId,
      duration_ms: duration,
      tokens: success.usage?.output_tokens || 0,
      inputTokens: success.usage?.input_tokens || 0,
      stopReason: success.stop_reason || 'end_turn',
      costUsd: success.total_cost_usd,
      claudeCodeVersion,
    };
  }

  if (resultMessage) {
    const sdkError = resultMessage as SDKResultError;
    const errorMsg = sdkError.errors?.join('; ') || sdkError.subtype || 'Unknown SDK error';
    const diagnosis = diagnoseSDKError(errorMsg, stderrOutput);
    const numTurns = (sdkError as any).num_turns;

    // On crash result without stderr, trigger debug for next call
    if (diagnosis.errorType === 'crash' && !stderrOutput) {
      _debugAfterCrash = true;
    }

    return {
      success: false,
      error: errorMsg,
      errorType: diagnosis.errorType,
      suggestions: diagnosis.suggestions,
      stderrOutput,
      model: modelId,
      duration_ms: duration,
      claudeCodeVersion,
      ...(numTurns != null && { numTurns }),
    };
  }

  return {
    success: false,
    error: 'No result received from Claude Agent SDK',
    errorType: 'unknown' as const,
    suggestions: ['Brak odpowiedzi z SDK — sprawdź czy Claude Code działa poprawnie'],
    model: modelId,
    duration_ms: duration,
  };
}

/**
 * Stream completion using Claude Agent SDK.
 * Yields text chunks as they arrive.
 */
export async function* streamGenerate(prompt, options: any = {}) {
  const { model = 'claude-sonnet', system, maxTokens = 4096, temperature = 0.7 } = options;

  const modelId = resolveModel(model);
  const stderrLines: string[] = [];

  const forceDebug = _debugAfterCrash || !!process.env.CLAUDE_SDK_DEBUG;

  try {
    const sdkOptions: any = {
      model: modelId,
      maxTurns: options.maxTurns ?? 1,
      // NOTE: Do NOT pass options.tools (definition objects) — SDK expects string[] filter
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      includePartialMessages: true,
      persistSession: false,
      settingSources: [],

      // Capture stderr
      stderr: (data: string) => {
        stderrLines.push(data);
        if (forceDebug || process.env.DEBUG) {
          logger.debug(`[SDK stream stderr] ${data.trim()}`);
        }
      },
      ...(forceDebug ? { debug: true } : {}),
      ...(process.env.CLAUDE_SDK_DEBUG_FILE
        ? { debugFile: process.env.CLAUDE_SDK_DEBUG_FILE }
        : {}),
      spawnClaudeCodeProcess: createSpawnInterceptor(),
    };

    if (system) {
      sdkOptions.systemPrompt = system;
    }

    for await (const message of sdkQuery({ prompt, options: sdkOptions })) {
      if (message.type === 'stream_event') {
        const event = (message as any).event;
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    }

    // Stream completed successfully — reset crash flag
    _debugAfterCrash = false;
  } catch (error) {
    const stderrOutput = stderrLines.length > 0 ? stderrLines.join('\n') : undefined;
    const diagnosis = diagnoseSDKError(error.message, stderrOutput);

    // Enable debug for next call if crash without stderr
    if (diagnosis.errorType === 'crash' && !stderrOutput) {
      _debugAfterCrash = true;
    }

    logger.error('Claude SDK stream error', {
      message: error.message,
      errorType: diagnosis.errorType,
      stderrPreview: stderrOutput?.slice(0, 500),
      env: collectEnvDiagnostics(),
    });

    const enrichedError: any = new Error(`Stream error: ${error.message}`);
    enrichedError.errorType = diagnosis.errorType;
    enrichedError.suggestions = diagnosis.suggestions;
    enrichedError.stderrOutput = stderrOutput;
    throw enrichedError;
  }
}

/**
 * Perform health check via Claude Agent SDK
 */
export async function healthCheck() {
  const startTime = Date.now();
  const stderrLines: string[] = [];
  let claudeCodeVersion: string | undefined;
  const forceDebug = _debugAfterCrash || !!process.env.CLAUDE_SDK_DEBUG;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let available = false;

    for await (const message of sdkQuery({
      prompt: 'Reply with the single word "pong" and nothing else.',
      options: {
        model: CLAUDE_MODELS['claude-sonnet'].id,
        maxTurns: 1,
        // NOTE: Do NOT pass tools: [] — SDK interprets it as --tools "" which disables all built-in tools
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        abortController: controller,
        persistSession: false,
        settingSources: [],

        stderr: (data: string) => {
          stderrLines.push(data);
          if (forceDebug || process.env.DEBUG) {
            logger.debug(`[SDK healthcheck stderr] ${data.trim()}`);
          }
        },
        ...(forceDebug ? { debug: true } : {}),
        spawnClaudeCodeProcess: createSpawnInterceptor(),
      },
    })) {
      // Capture version from init message
      if (message.type === 'system' && (message as any).subtype === 'init') {
        claudeCodeVersion =
          (message as any).claude_code_version || (message as any).claudeCodeVersion;
      }

      if (message.type === 'result') {
        available = message.subtype === 'success';
        break;
      }
    }

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (available) {
      _debugAfterCrash = false; // Reset on healthy check
    }

    return {
      available,
      provider: 'claude-agent-sdk',
      models: Object.keys(CLAUDE_MODELS),
      latency_ms: latency,
      claudeCodeVersion,
      checkedAt: new Date(),
    };
  } catch (error) {
    const stderrOutput = stderrLines.length > 0 ? stderrLines.join('\n') : undefined;
    const diagnosis = diagnoseSDKError(error.message, stderrOutput);

    if (diagnosis.errorType === 'crash' && !stderrOutput) {
      _debugAfterCrash = true;
    }

    logger.error('Health check failed', {
      error: error.message,
      errorType: diagnosis.errorType,
      stderrPreview: stderrOutput?.slice(0, 500),
      env: collectEnvDiagnostics(),
    });

    return {
      available: false,
      error: error.message,
      errorType: diagnosis.errorType,
      suggestions: diagnosis.suggestions,
      stderrOutput,
      latency_ms: Date.now() - startTime,
    };
  }
}

/**
 * Get available Claude models
 */
export function getAvailableModels() {
  return Object.keys(CLAUDE_MODELS);
}

/**
 * Select best model for tier
 */
export function selectModel(tier) {
  switch (tier) {
    case 'commander':
      return 'claude-opus';
    case 'coordinator':
      return 'claude-sonnet';
    default:
      return 'claude-sonnet';
  }
}

export default {
  CLAUDE_MODELS,
  MODEL_ALIASES,
  DIRECT_MODEL_MAP,
  resolveModel,
  isClaudeModel,
  getModelConfig,
  generate,
  streamGenerate,
  healthCheck,
  getAvailableModels,
  selectModel,
  diagnoseSDKError,
};
