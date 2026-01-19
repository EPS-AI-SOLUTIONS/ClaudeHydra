/**
 * HYDRA Environment Validator
 * BLOK 1: Security - Geralt
 * Validates required environment variables at startup
 */

const REQUIRED_VARS = [
  { name: 'OLLAMA_HOST', default: 'http://localhost:11434' },
  { name: 'DEFAULT_MODEL', default: 'llama3.2:3b' }
];

const OPTIONAL_VARS = [
  { name: 'GOOGLE_API_KEY', sensitive: true },
  { name: 'GEMINI_API_KEY', sensitive: true },
  { name: 'OPENAI_API_KEY', sensitive: true },
  { name: 'ANTHROPIC_API_KEY', sensitive: true },
  { name: 'XAI_API_KEY', sensitive: true },
  { name: 'DEEPSEEK_API_KEY', sensitive: true },
  { name: 'CACHE_ENCRYPTION_KEY', sensitive: true },
  { name: 'CACHE_ENABLED', default: 'true' },
  { name: 'CACHE_TTL', default: '3600' },
  { name: 'LOG_LEVEL', default: 'info' },
  { name: 'NODE_ENV', default: 'development' }
];

/**
 * Mask sensitive values for logging
 */
export function maskSensitive(value, showChars = 8) {
  if (!value || value.length <= showChars) return '***';
  return value.substring(0, showChars) + '...[MASKED]';
}

/**
 * Validate environment variables
 * @returns {{ valid: boolean, missing: string[], warnings: string[], masked: object }}
 */
export function validateEnv() {
  const missing = [];
  const warnings = [];
  const masked = {};

  // Check required variables
  for (const { name, default: defaultVal } of REQUIRED_VARS) {
    if (!process.env[name]) {
      if (defaultVal) {
        process.env[name] = defaultVal;
        warnings.push(`${name} not set, using default: ${defaultVal}`);
      } else {
        missing.push(name);
      }
    }
    masked[name] = process.env[name] || '(not set)';
  }

  // Check optional variables (especially API keys)
  for (const { name, sensitive, default: defaultVal } of OPTIONAL_VARS) {
    const value = process.env[name];
    if (value) {
      masked[name] = sensitive ? maskSensitive(value) : value;
    } else if (defaultVal) {
      process.env[name] = defaultVal;
      masked[name] = defaultVal;
    } else {
      masked[name] = '(not set)';
    }
  }

  // Validate API key formats
  const apiKeyPatterns = {
    GOOGLE_API_KEY: /^AIza[0-9A-Za-z_-]{35}$/,
    OPENAI_API_KEY: /^sk-[a-zA-Z0-9-_]{20,}$/,
    ANTHROPIC_API_KEY: /^sk-ant-[a-zA-Z0-9-_]{20,}$/,
    XAI_API_KEY: /^xai-[a-zA-Z0-9-_]{20,}$/,
    DEEPSEEK_API_KEY: /^sk-[a-zA-Z0-9]{20,}$/
  };

  for (const [keyName, pattern] of Object.entries(apiKeyPatterns)) {
    const value = process.env[keyName];
    if (value && !pattern.test(value)) {
      warnings.push(`${keyName} format appears invalid`);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
    masked
  };
}

/**
 * Print validation report
 */
export function printEnvReport() {
  const result = validateEnv();

  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│  🔒 HYDRA Environment Validation        │');
  console.log('├─────────────────────────────────────────┤');

  if (result.valid) {
    console.log('│  ✅ All required variables present      │');
  } else {
    console.log('│  ❌ Missing required variables:         │');
    for (const name of result.missing) {
      console.log(`│     - ${name.padEnd(32)} │`);
    }
  }

  if (result.warnings.length > 0) {
    console.log('├─────────────────────────────────────────┤');
    console.log('│  ⚠️  Warnings:                          │');
    for (const warning of result.warnings) {
      console.log(`│  ${warning.substring(0, 37).padEnd(38)}│`);
    }
  }

  console.log('├─────────────────────────────────────────┤');
  console.log('│  📋 Environment Summary:                │');
  for (const [key, value] of Object.entries(result.masked)) {
    const displayVal = String(value).substring(0, 20);
    console.log(`│  ${key.padEnd(20)} ${displayVal.padEnd(17)}│`);
  }
  console.log('└─────────────────────────────────────────┘\n');

  return result;
}

/**
 * Quick check - throws if critical vars missing
 */
export function assertEnv() {
  const result = validateEnv();
  if (!result.valid) {
    throw new Error(`Missing required environment variables: ${result.missing.join(', ')}`);
  }
  return true;
}

export default { validateEnv, printEnvReport, assertEnv, maskSensitive };
