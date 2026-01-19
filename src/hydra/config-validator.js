/**
 * HYDRA Config Validator Module
 * JSON Schema validation and hot-reload support
 */

import { readFileSync, writeFileSync, existsSync, watch } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import Ajv from 'ajv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

/**
 * Config Validator class
 */
export class ConfigValidator {
  constructor(schemaPath) {
    this.schemaPath = schemaPath || join(REPO_ROOT, 'hydra.config.schema.json');
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    this.schema = null;
    this.validate = null;
    this.loadSchema();
  }

  /**
   * Load JSON Schema
   */
  loadSchema() {
    if (!existsSync(this.schemaPath)) {
      console.warn(`[ConfigValidator] Schema not found: ${this.schemaPath}`);
      return false;
    }

    try {
      const schemaContent = readFileSync(this.schemaPath, 'utf-8');
      this.schema = JSON.parse(schemaContent);
      this.validate = this.ajv.compile(this.schema);
      return true;
    } catch (error) {
      console.error(`[ConfigValidator] Failed to load schema: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate config object
   */
  validateConfig(config) {
    if (!this.validate) {
      return { valid: true, errors: [], warnings: ['Schema not loaded'] };
    }

    const valid = this.validate(config);
    const errors = this.validate.errors || [];

    return {
      valid,
      errors: errors.map((e) => ({
        path: e.instancePath || e.dataPath || '',
        message: e.message,
        keyword: e.keyword,
        params: e.params,
      })),
      warnings: [],
    };
  }

  /**
   * Validate config file
   */
  validateFile(configPath) {
    if (!existsSync(configPath)) {
      return {
        valid: false,
        errors: [{ path: '', message: 'Config file not found' }],
        warnings: [],
      };
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      return this.validateConfig(config);
    } catch (error) {
      return {
        valid: false,
        errors: [{ path: '', message: `JSON parse error: ${error.message}` }],
        warnings: [],
      };
    }
  }

  /**
   * Format validation errors for display
   */
  formatErrors(result) {
    if (result.valid && result.warnings.length === 0) {
      return '✓ Config is valid';
    }

    const lines = [];

    if (!result.valid) {
      lines.push('✗ Config validation failed:');
      for (const error of result.errors) {
        const path = error.path || '(root)';
        lines.push(`  - ${path}: ${error.message}`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push('Warnings:');
      for (const warning of result.warnings) {
        lines.push(`  ⚠ ${warning}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Config Hot Reload Manager
 */
export class ConfigHotReload {
  constructor(configPath, options = {}) {
    this.configPath = configPath;
    this.debounceMs = options.debounceMs || 500;
    this.validator = options.validator || new ConfigValidator();
    this.currentConfig = null;
    this.listeners = [];
    this.watcher = null;
    this.debounceTimer = null;
    this.enabled = false;
  }

  /**
   * Load config
   */
  load() {
    if (!existsSync(this.configPath)) {
      return null;
    }

    try {
      const content = readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(content);

      // Validate
      const validation = this.validator.validateConfig(config);
      if (!validation.valid) {
        console.error('[HotReload] Config validation failed, keeping old config');
        return this.currentConfig;
      }

      this.currentConfig = config;
      return config;
    } catch (error) {
      console.error(`[HotReload] Failed to load config: ${error.message}`);
      return this.currentConfig;
    }
  }

  /**
   * Start watching for changes
   */
  start() {
    if (this.enabled) return this;

    this.load();
    this.enabled = true;

    try {
      this.watcher = watch(this.configPath, (eventType) => {
        if (eventType === 'change') {
          this.handleChange();
        }
      });

      console.log(`[HotReload] Watching config: ${this.configPath}`);
    } catch (error) {
      console.error(`[HotReload] Failed to start watcher: ${error.message}`);
    }

    return this;
  }

  /**
   * Handle file change
   */
  handleChange() {
    // Debounce rapid changes
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      const oldConfig = this.currentConfig;
      const newConfig = this.load();

      if (newConfig && newConfig !== oldConfig) {
        console.log('[HotReload] Config reloaded');
        this.notifyListeners(newConfig, oldConfig);
      }
    }, this.debounceMs);
  }

  /**
   * Add change listener
   */
  onChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Notify listeners of config change
   */
  notifyListeners(newConfig, oldConfig) {
    for (const listener of this.listeners) {
      try {
        listener(newConfig, oldConfig);
      } catch (error) {
        console.error(`[HotReload] Listener error: ${error.message}`);
      }
    }
  }

  /**
   * Stop watching
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.enabled = false;
    return this;
  }

  /**
   * Get current config
   */
  getConfig() {
    return this.currentConfig;
  }
}

/**
 * Portable Mode Manager
 */
export class PortableMode {
  constructor(options = {}) {
    this.enabled = options.enabled || process.argv.includes('--portable');
    this.baseDir = options.baseDir || REPO_ROOT;
  }

  /**
   * Check if portable mode is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get path relative to portable base
   */
  getPath(relativePath) {
    if (!this.enabled) {
      return relativePath;
    }
    return join(this.baseDir, relativePath);
  }

  /**
   * Get all portable paths
   */
  getPaths() {
    return {
      config: this.getPath('hydra.config.json'),
      data: this.getPath('.hydra-data'),
      logs: this.getPath('.hydra-data/logs'),
      cache: this.getPath('.hydra-data/cache'),
      crashes: this.getPath('.hydra-data/crashes'),
    };
  }

  /**
   * Get data directory
   */
  getDataDir() {
    if (this.enabled) {
      return join(this.baseDir, '.hydra-data');
    }

    // Default: user home directory
    const home = process.env.USERPROFILE || process.env.HOME || '';
    return join(home, '.hydra');
  }
}

/**
 * Config Sync Manager (Git-based)
 */
export class ConfigSync {
  constructor(options = {}) {
    this.configPath = options.configPath || join(REPO_ROOT, 'hydra.config.json');
    this.gitDir = options.gitDir || REPO_ROOT;
  }

  /**
   * Check if config is tracked by git
   */
  isTracked() {
        const result = spawnSync(
      'git',
      ['ls-files', '--error-unmatch', this.configPath],
      { cwd: this.gitDir, stdio: 'pipe' }
    );
    return result.status === 0;
  }

  /**
   * Check if config has uncommitted changes
   */
  hasChanges() {
        const result = spawnSync('git', ['diff', '--name-only', this.configPath], {
      cwd: this.gitDir,
      stdio: 'pipe',
    });
    return result.stdout?.toString().trim().length > 0;
  }

  /**
   * Get last commit info for config
   */
  getLastCommit() {
        const result = spawnSync(
      'git',
      ['log', '-1', '--format=%H|%an|%ai|%s', '--', this.configPath],
      { cwd: this.gitDir, stdio: 'pipe' }
    );

    if (result.status !== 0) return null;

    const output = result.stdout?.toString().trim();
    if (!output) return null;

    const [hash, author, date, message] = output.split('|');
    return { hash, author, date, message };
  }

  /**
   * Backup config before changes
   */
  backup() {
    if (!existsSync(this.configPath)) return null;

    const backupPath = `${this.configPath}.backup.${Date.now()}`;
    const content = readFileSync(this.configPath, 'utf-8');
    writeFileSync(backupPath, content);

    return backupPath;
  }

  /**
   * Restore from backup
   */
  restore(backupPath) {
    if (!existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupPath}`);
    }

    const content = readFileSync(backupPath, 'utf-8');
    writeFileSync(this.configPath, content);
  }

  /**
   * Get sync status
   */
  status() {
    return {
      tracked: this.isTracked(),
      hasChanges: this.hasChanges(),
      lastCommit: this.getLastCommit(),
    };
  }
}

// Singleton instances
let configValidator = null;
let configHotReload = null;
let portableMode = null;
let configSync = null;

export function getConfigValidator(schemaPath) {
  if (!configValidator) {
    configValidator = new ConfigValidator(schemaPath);
  }
  return configValidator;
}

export function getConfigHotReload(configPath, options) {
  if (!configHotReload) {
    configHotReload = new ConfigHotReload(configPath, options);
  }
  return configHotReload;
}

export function getPortableMode(options) {
  if (!portableMode) {
    portableMode = new PortableMode(options);
  }
  return portableMode;
}

export function getConfigSync(options) {
  if (!configSync) {
    configSync = new ConfigSync(options);
  }
  return configSync;
}
