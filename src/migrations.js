/**
 * @fileoverview Migration System for Hydra Cache/Schema
 *
 * Provides a robust migration framework for managing cache schema and data structure changes.
 * Supports up/down migrations, version tracking, rollbacks, and migration status reporting.
 *
 * @example
 * import { runAllMigrations, getMigrationStatus, rollbackTo } from './migrations.js';
 *
 * // Run all pending migrations
 * await runAllMigrations();
 *
 * // Check migration status
 * const status = await getMigrationStatus(MIGRATIONS);
 *
 * // Rollback to specific version
 * await rollbackTo(1);
 */

import { promises as fs } from 'fs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { createLogger } from './logger.js';
import { CONFIG } from './config.js';

const logger = createLogger('migrations');

// ============================================================================
// Configuration
// ============================================================================

/**
 * Path to migration version tracking file
 * @type {string}
 */
const MIGRATION_FILE = join(process.cwd(), '.hydra-migrations.json');

/**
 * Default migration state structure
 * @type {Object}
 */
const DEFAULT_MIGRATION_STATE = {
  version: 0,
  lastMigration: null,
  history: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// ============================================================================
// Version Management
// ============================================================================

/**
 * Get the current migration version from the tracking file.
 * Creates the file with default state if it doesn't exist.
 *
 * @returns {Promise<number>} Current migration version (0 if no migrations run)
 *
 * @example
 * const version = await getMigrationVersion();
 * console.log(`Current version: ${version}`);
 */
export async function getMigrationVersion() {
  try {
    if (!existsSync(MIGRATION_FILE)) {
      return 0;
    }

    const content = await fs.readFile(MIGRATION_FILE, 'utf-8');
    const state = JSON.parse(content);
    return state.version ?? 0;
  } catch (error) {
    logger.warn('Failed to read migration version, assuming version 0', {
      error: error.message
    });
    return 0;
  }
}

/**
 * Get the full migration state from the tracking file.
 *
 * @returns {Promise<Object>} Full migration state object
 */
export async function getMigrationState() {
  try {
    if (!existsSync(MIGRATION_FILE)) {
      return { ...DEFAULT_MIGRATION_STATE };
    }

    const content = await fs.readFile(MIGRATION_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    logger.warn('Failed to read migration state', { error: error.message });
    return { ...DEFAULT_MIGRATION_STATE };
  }
}

/**
 * Set the migration version and record the migration in history.
 *
 * @param {number} version - New version number
 * @param {string} migrationName - Name of the migration that was run
 * @param {'up'|'down'} direction - Migration direction (up or down)
 * @returns {Promise<void>}
 *
 * @example
 * await setMigrationVersion(2, 'migration_cache_v2', 'up');
 */
export async function setMigrationVersion(version, migrationName, direction) {
  try {
    // Ensure directory exists
    const dir = dirname(MIGRATION_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Read current state
    let state = await getMigrationState();

    // Update state
    state.version = version;
    state.lastMigration = migrationName;
    state.updatedAt = new Date().toISOString();

    // Add to history
    if (!state.history) {
      state.history = [];
    }

    state.history.push({
      version,
      migration: migrationName,
      direction,
      timestamp: new Date().toISOString()
    });

    // Keep only last 100 history entries
    if (state.history.length > 100) {
      state.history = state.history.slice(-100);
    }

    // Write state atomically
    const tempFile = `${MIGRATION_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    await fs.rename(tempFile, MIGRATION_FILE);

    logger.info(`Migration version set to ${version}`, {
      migration: migrationName,
      direction
    });
  } catch (error) {
    logger.error('Failed to set migration version', {
      version,
      migrationName,
      error: error.message
    });
    throw error;
  }
}

// ============================================================================
// Migration Execution
// ============================================================================

/**
 * Execute a single migration in the specified direction.
 *
 * @param {Migration} migration - Migration object to run
 * @param {'up'|'down'} direction - Direction to run the migration
 * @returns {Promise<{success: boolean, duration: number, error?: string}>}
 *
 * @example
 * const result = await runMigration(migration_cache_v2, 'up');
 * if (result.success) {
 *   console.log(`Migration completed in ${result.duration}ms`);
 * }
 */
export async function runMigration(migration, direction) {
  const startTime = Date.now();

  logger.info(`Running migration: ${migration.name} (${direction})`, {
    version: migration.version,
    description: migration.description
  });

  try {
    if (direction === 'up') {
      await migration.up();
    } else if (direction === 'down') {
      await migration.down();
    } else {
      throw new Error(`Invalid migration direction: ${direction}`);
    }

    const duration = Date.now() - startTime;

    logger.info(`Migration ${migration.name} completed successfully`, {
      direction,
      duration: `${duration}ms`
    });

    return {
      success: true,
      duration,
      migration: migration.name,
      version: migration.version,
      direction
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(`Migration ${migration.name} failed`, {
      direction,
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`
    });

    return {
      success: false,
      duration,
      migration: migration.name,
      version: migration.version,
      direction,
      error: error.message
    };
  }
}

/**
 * Run migrations up to a target version.
 *
 * @param {Migration[]} migrations - Array of migration objects
 * @param {number} [targetVersion] - Target version (defaults to latest)
 * @returns {Promise<{success: boolean, migrationsRun: number, finalVersion: number, results: Object[]}>}
 *
 * @example
 * // Migrate to latest
 * await migrateUp(MIGRATIONS);
 *
 * // Migrate to specific version
 * await migrateUp(MIGRATIONS, 3);
 */
export async function migrateUp(migrations, targetVersion) {
  const currentVersion = await getMigrationVersion();
  const sortedMigrations = [...migrations].sort((a, b) => a.version - b.version);
  const latestVersion = sortedMigrations.length > 0
    ? sortedMigrations[sortedMigrations.length - 1].version
    : 0;

  // Default to latest version
  const target = targetVersion ?? latestVersion;

  if (currentVersion >= target) {
    logger.info('No migrations to run (already at target version)', {
      currentVersion,
      targetVersion: target
    });
    return {
      success: true,
      migrationsRun: 0,
      finalVersion: currentVersion,
      results: []
    };
  }

  const pendingMigrations = sortedMigrations.filter(
    m => m.version > currentVersion && m.version <= target
  );

  logger.info(`Running ${pendingMigrations.length} migration(s)`, {
    currentVersion,
    targetVersion: target,
    migrations: pendingMigrations.map(m => m.name)
  });

  const results = [];
  let finalVersion = currentVersion;

  for (const migration of pendingMigrations) {
    const result = await runMigration(migration, 'up');
    results.push(result);

    if (!result.success) {
      logger.error('Migration failed, stopping migration process', {
        failedMigration: migration.name,
        stoppedAt: finalVersion
      });

      return {
        success: false,
        migrationsRun: results.length,
        finalVersion,
        results,
        error: `Migration ${migration.name} failed: ${result.error}`
      };
    }

    // Update version tracking
    await setMigrationVersion(migration.version, migration.name, 'up');
    finalVersion = migration.version;
  }

  logger.info('All migrations completed successfully', {
    migrationsRun: results.length,
    finalVersion
  });

  return {
    success: true,
    migrationsRun: results.length,
    finalVersion,
    results
  };
}

/**
 * Rollback migrations down to a target version.
 *
 * @param {Migration[]} migrations - Array of migration objects
 * @param {number} targetVersion - Target version to rollback to
 * @returns {Promise<{success: boolean, migrationsRun: number, finalVersion: number, results: Object[]}>}
 *
 * @example
 * // Rollback to version 1
 * await migrateDown(MIGRATIONS, 1);
 *
 * // Rollback all migrations
 * await migrateDown(MIGRATIONS, 0);
 */
export async function migrateDown(migrations, targetVersion) {
  const currentVersion = await getMigrationVersion();

  if (currentVersion <= targetVersion) {
    logger.info('No migrations to rollback (already at or below target version)', {
      currentVersion,
      targetVersion
    });
    return {
      success: true,
      migrationsRun: 0,
      finalVersion: currentVersion,
      results: []
    };
  }

  // Sort migrations in descending order for rollback
  const sortedMigrations = [...migrations]
    .sort((a, b) => b.version - a.version)
    .filter(m => m.version <= currentVersion && m.version > targetVersion);

  logger.info(`Rolling back ${sortedMigrations.length} migration(s)`, {
    currentVersion,
    targetVersion,
    migrations: sortedMigrations.map(m => m.name)
  });

  const results = [];
  let finalVersion = currentVersion;

  for (const migration of sortedMigrations) {
    const result = await runMigration(migration, 'down');
    results.push(result);

    if (!result.success) {
      logger.error('Rollback failed, stopping rollback process', {
        failedMigration: migration.name,
        stoppedAt: finalVersion
      });

      return {
        success: false,
        migrationsRun: results.length,
        finalVersion,
        results,
        error: `Rollback of ${migration.name} failed: ${result.error}`
      };
    }

    // Update version to the previous migration version
    const prevVersion = migration.version - 1;
    const prevMigration = migrations.find(m => m.version === prevVersion);
    await setMigrationVersion(
      prevVersion,
      prevMigration?.name ?? 'initial',
      'down'
    );
    finalVersion = prevVersion;
  }

  logger.info('All rollbacks completed successfully', {
    migrationsRun: results.length,
    finalVersion
  });

  return {
    success: true,
    migrationsRun: results.length,
    finalVersion,
    results
  };
}

// ============================================================================
// Migration Status
// ============================================================================

/**
 * Get the current migration status including pending and applied migrations.
 *
 * @param {Migration[]} migrations - Array of migration objects
 * @returns {Promise<Object>} Migration status object
 *
 * @example
 * const status = await getMigrationStatus(MIGRATIONS);
 * console.log(`Current version: ${status.currentVersion}`);
 * console.log(`Pending migrations: ${status.pending.length}`);
 */
export async function getMigrationStatus(migrations) {
  const currentVersion = await getMigrationVersion();
  const state = await getMigrationState();
  const sortedMigrations = [...migrations].sort((a, b) => a.version - b.version);

  const applied = sortedMigrations.filter(m => m.version <= currentVersion);
  const pending = sortedMigrations.filter(m => m.version > currentVersion);
  const latestVersion = sortedMigrations.length > 0
    ? sortedMigrations[sortedMigrations.length - 1].version
    : 0;

  return {
    currentVersion,
    latestVersion,
    isUpToDate: currentVersion >= latestVersion,
    lastMigration: state.lastMigration,
    lastUpdated: state.updatedAt,
    applied: applied.map(m => ({
      name: m.name,
      version: m.version,
      description: m.description
    })),
    pending: pending.map(m => ({
      name: m.name,
      version: m.version,
      description: m.description
    })),
    history: state.history?.slice(-10) ?? [],
    totalMigrations: migrations.length
  };
}

// ============================================================================
// Example Migration: Cache V2 (adds tags field)
// ============================================================================

/**
 * Migration to add tags support to cache entries.
 * @type {Migration}
 */
const migration_cache_v2 = {
  name: 'migration_cache_v2',
  version: 1,
  description: 'Add tags field to cache entries for improved categorization',

  /**
   * Upgrade: Add tags field to all existing cache entries
   */
  async up() {
    const cacheDir = CONFIG.CACHE_DIR || join(process.cwd(), 'cache');

    if (!existsSync(cacheDir)) {
      logger.info('Cache directory does not exist, nothing to migrate');
      return;
    }

    const files = await fs.readdir(cacheDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of jsonFiles) {
      const filePath = join(cacheDir, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const entry = JSON.parse(content);

        // Skip if already has tags
        if (entry.tags !== undefined) {
          skipped++;
          continue;
        }

        // Add tags field with default empty array
        entry.tags = [];
        entry.migratedAt = new Date().toISOString();
        entry.schemaVersion = 2;

        // Write back
        await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
        migrated++;
      } catch (error) {
        logger.warn(`Failed to migrate cache file: ${file}`, { error: error.message });
        errors++;
      }
    }

    logger.info('Cache v2 migration completed', {
      migrated,
      skipped,
      errors,
      total: jsonFiles.length
    });
  },

  /**
   * Downgrade: Remove tags field from all cache entries
   */
  async down() {
    const cacheDir = CONFIG.CACHE_DIR || join(process.cwd(), 'cache');

    if (!existsSync(cacheDir)) {
      logger.info('Cache directory does not exist, nothing to rollback');
      return;
    }

    const files = await fs.readdir(cacheDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let rolledBack = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of jsonFiles) {
      const filePath = join(cacheDir, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const entry = JSON.parse(content);

        // Skip if doesn't have tags
        if (entry.tags === undefined) {
          skipped++;
          continue;
        }

        // Remove tags field and migration metadata
        delete entry.tags;
        delete entry.migratedAt;
        delete entry.schemaVersion;

        // Write back
        await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
        rolledBack++;
      } catch (error) {
        logger.warn(`Failed to rollback cache file: ${file}`, { error: error.message });
        errors++;
      }
    }

    logger.info('Cache v2 rollback completed', {
      rolledBack,
      skipped,
      errors,
      total: jsonFiles.length
    });
  }
};

/**
 * Migration to add metadata support to cache entries.
 * @type {Migration}
 */
const migration_cache_v3_metadata = {
  name: 'migration_cache_v3_metadata',
  version: 2,
  description: 'Add metadata field to cache entries for extended information storage',

  async up() {
    const cacheDir = CONFIG.CACHE_DIR || join(process.cwd(), 'cache');

    if (!existsSync(cacheDir)) {
      logger.info('Cache directory does not exist, nothing to migrate');
      return;
    }

    const files = await fs.readdir(cacheDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of jsonFiles) {
      const filePath = join(cacheDir, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const entry = JSON.parse(content);

        // Skip if already has metadata
        if (entry.metadata !== undefined) {
          skipped++;
          continue;
        }

        // Add metadata field
        entry.metadata = {
          createdBy: 'hydra',
          version: '2.0',
          migratedFrom: entry.schemaVersion ?? 1
        };
        entry.schemaVersion = 3;

        await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
        migrated++;
      } catch (error) {
        logger.warn(`Failed to migrate cache file: ${file}`, { error: error.message });
        errors++;
      }
    }

    logger.info('Cache v3 metadata migration completed', { migrated, skipped, errors });
  },

  async down() {
    const cacheDir = CONFIG.CACHE_DIR || join(process.cwd(), 'cache');

    if (!existsSync(cacheDir)) {
      logger.info('Cache directory does not exist, nothing to rollback');
      return;
    }

    const files = await fs.readdir(cacheDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let rolledBack = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of jsonFiles) {
      const filePath = join(cacheDir, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const entry = JSON.parse(content);

        if (entry.metadata === undefined) {
          skipped++;
          continue;
        }

        // Restore previous schema version
        const prevVersion = entry.metadata?.migratedFrom ?? 2;
        delete entry.metadata;
        entry.schemaVersion = prevVersion;

        await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
        rolledBack++;
      } catch (error) {
        logger.warn(`Failed to rollback cache file: ${file}`, { error: error.message });
        errors++;
      }
    }

    logger.info('Cache v3 metadata rollback completed', { rolledBack, skipped, errors });
  }
};

// ============================================================================
// Migrations Registry
// ============================================================================

/**
 * @typedef {Object} Migration
 * @property {string} name - Unique migration name
 * @property {number} version - Migration version number (must be unique and sequential)
 * @property {string} description - Human-readable description of the migration
 * @property {function(): Promise<void>} up - Function to apply the migration
 * @property {function(): Promise<void>} down - Function to rollback the migration
 */

/**
 * Array of all migrations in order.
 * Add new migrations to this array.
 *
 * @type {Migration[]}
 *
 * @example
 * // To add a new migration:
 * const migration_cache_v4 = {
 *   name: 'migration_cache_v4',
 *   version: 3,
 *   description: 'Your migration description',
 *   async up() { ... },
 *   async down() { ... }
 * };
 *
 * MIGRATIONS.push(migration_cache_v4);
 */
export const MIGRATIONS = [
  migration_cache_v2,
  migration_cache_v3_metadata
];

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Run all pending migrations.
 *
 * @returns {Promise<{success: boolean, migrationsRun: number, finalVersion: number, results: Object[]}>}
 *
 * @example
 * const result = await runAllMigrations();
 * if (result.success) {
 *   console.log(`Migrated to version ${result.finalVersion}`);
 * }
 */
export async function runAllMigrations() {
  logger.info('Starting migration process');
  const result = await migrateUp(MIGRATIONS);

  if (result.success) {
    logger.info('Migration process completed', {
      migrationsRun: result.migrationsRun,
      finalVersion: result.finalVersion
    });
  } else {
    logger.error('Migration process failed', {
      error: result.error,
      stoppedAt: result.finalVersion
    });
  }

  return result;
}

/**
 * Rollback to a specific migration version.
 *
 * @param {number} targetVersion - Version to rollback to (0 for initial state)
 * @returns {Promise<{success: boolean, migrationsRun: number, finalVersion: number, results: Object[]}>}
 *
 * @example
 * // Rollback to version 1
 * await rollbackTo(1);
 *
 * // Rollback all migrations
 * await rollbackTo(0);
 */
export async function rollbackTo(targetVersion) {
  if (targetVersion < 0) {
    throw new Error('Target version cannot be negative');
  }

  logger.info(`Starting rollback to version ${targetVersion}`);
  const result = await migrateDown(MIGRATIONS, targetVersion);

  if (result.success) {
    logger.info('Rollback completed', {
      migrationsRolledBack: result.migrationsRun,
      finalVersion: result.finalVersion
    });
  } else {
    logger.error('Rollback failed', {
      error: result.error,
      stoppedAt: result.finalVersion
    });
  }

  return result;
}

/**
 * Create a new migration template.
 *
 * @param {string} name - Migration name (will be prefixed with 'migration_')
 * @param {string} description - Migration description
 * @returns {Migration} Migration template object
 *
 * @example
 * const newMigration = createMigration('add_priority', 'Add priority field to cache entries');
 * // Then implement the up() and down() functions
 */
export function createMigration(name, description) {
  const sortedMigrations = [...MIGRATIONS].sort((a, b) => a.version - b.version);
  const nextVersion = sortedMigrations.length > 0
    ? sortedMigrations[sortedMigrations.length - 1].version + 1
    : 1;

  return {
    name: `migration_${name}`,
    version: nextVersion,
    description,
    async up() {
      throw new Error('Migration up() not implemented');
    },
    async down() {
      throw new Error('Migration down() not implemented');
    }
  };
}

/**
 * Validate migrations array for consistency.
 *
 * @param {Migration[]} migrations - Array of migrations to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateMigrations(migrations) {
  const errors = [];
  const versions = new Set();
  const names = new Set();

  for (const migration of migrations) {
    // Check required fields
    if (!migration.name) {
      errors.push('Migration missing name');
    }
    if (migration.version === undefined || migration.version === null) {
      errors.push(`Migration ${migration.name || 'unknown'} missing version`);
    }
    if (!migration.description) {
      errors.push(`Migration ${migration.name || 'unknown'} missing description`);
    }
    if (typeof migration.up !== 'function') {
      errors.push(`Migration ${migration.name || 'unknown'} missing up() function`);
    }
    if (typeof migration.down !== 'function') {
      errors.push(`Migration ${migration.name || 'unknown'} missing down() function`);
    }

    // Check for duplicates
    if (versions.has(migration.version)) {
      errors.push(`Duplicate migration version: ${migration.version}`);
    }
    versions.add(migration.version);

    if (names.has(migration.name)) {
      errors.push(`Duplicate migration name: ${migration.name}`);
    }
    names.add(migration.name);
  }

  // Check for gaps in versions
  const sortedVersions = Array.from(versions).sort((a, b) => a - b);
  for (let i = 0; i < sortedVersions.length - 1; i++) {
    if (sortedVersions[i + 1] - sortedVersions[i] > 1) {
      errors.push(`Gap in migration versions between ${sortedVersions[i]} and ${sortedVersions[i + 1]}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  getMigrationVersion,
  getMigrationState,
  setMigrationVersion,
  runMigration,
  migrateUp,
  migrateDown,
  getMigrationStatus,
  runAllMigrations,
  rollbackTo,
  createMigration,
  validateMigrations,
  MIGRATIONS
};
