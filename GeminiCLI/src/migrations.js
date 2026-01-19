/**
 * HYDRA Migration System - Database/Cache schema migrations
 * Agent: Zoltan (Data/Database)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('migrations');
const MIGRATION_FILE = join(process.cwd(), '.hydra-migrations.json');

/**
 * Get current migration version
 * @returns {{ version: number, appliedMigrations: string[], lastMigrationAt: string|null }}
 */
export function getMigrationVersion() {
  try {
    if (!existsSync(MIGRATION_FILE)) {
      return {
        version: 0,
        appliedMigrations: [],
        lastMigrationAt: null
      };
    }

    const data = JSON.parse(readFileSync(MIGRATION_FILE, 'utf-8'));
    return {
      version: data.version || 0,
      appliedMigrations: data.appliedMigrations || [],
      lastMigrationAt: data.lastMigrationAt || null
    };
  } catch (error) {
    logger.error('Failed to read migration version', { error: error.message });
    return {
      version: 0,
      appliedMigrations: [],
      lastMigrationAt: null
    };
  }
}

/**
 * Set migration version
 * @param {number} version - New version number
 * @param {string} migrationName - Name of the applied migration
 * @param {'up'|'down'} direction - Migration direction
 * @returns {boolean} Success status
 */
export function setMigrationVersion(version, migrationName = '', direction = 'up') {
  try {
    const current = getMigrationVersion();

    let appliedMigrations = [...current.appliedMigrations];
    if (direction === 'up' && migrationName && !appliedMigrations.includes(migrationName)) {
      appliedMigrations.push(migrationName);
    } else if (direction === 'down' && migrationName) {
      appliedMigrations = appliedMigrations.filter(m => m !== migrationName);
    }

    const data = {
      version,
      appliedMigrations,
      lastMigrationAt: new Date().toISOString(),
      history: [
        ...(current.history || []),
        {
          from: current.version,
          to: version,
          migration: migrationName,
          direction,
          timestamp: new Date().toISOString()
        }
      ].slice(-50) // Keep last 50 history entries
    };

    writeFileSync(MIGRATION_FILE, JSON.stringify(data, null, 2), 'utf-8');
    logger.info('Migration version updated', { version, migration: migrationName, direction });
    return true;
  } catch (error) {
    logger.error('Failed to set migration version', { error: error.message });
    return false;
  }
}

/**
 * Run a single migration
 * @param {Object} migration - Migration object
 * @param {string} migration.name - Migration name
 * @param {number} migration.version - Migration version
 * @param {Function} migration.up - Up migration function
 * @param {Function} migration.down - Down migration function
 * @param {'up'|'down'} direction - Migration direction
 * @returns {Promise<{ success: boolean, error?: string, duration: number }>}
 */
export async function runMigration(migration, direction = 'up') {
  const startTime = Date.now();
  const migrationFn = direction === 'up' ? migration.up : migration.down;

  if (typeof migrationFn !== 'function') {
    return {
      success: false,
      error: `Migration ${migration.name} does not have a valid '${direction}' function`,
      duration: 0
    };
  }

  logger.info(`Running migration: ${migration.name} (${direction})`, { version: migration.version });

  try {
    await migrationFn();
    const duration = Date.now() - startTime;

    logger.info(`Migration ${migration.name} completed`, { direction, duration });

    return {
      success: true,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Migration ${migration.name} failed`, { direction, error: error.message, duration });

    return {
      success: false,
      error: error.message,
      duration
    };
  }
}

/**
 * Migrate up to latest or specific version
 * @param {Array} migrations - Array of migration objects sorted by version
 * @param {number|null} targetVersion - Target version (null = latest)
 * @returns {Promise<{ success: boolean, applied: string[], errors: string[], finalVersion: number }>}
 */
export async function migrateUp(migrations, targetVersion = null) {
  const current = getMigrationVersion();
  const sortedMigrations = [...migrations].sort((a, b) => a.version - b.version);

  const maxVersion = targetVersion ?? Math.max(...sortedMigrations.map(m => m.version), 0);
  const pendingMigrations = sortedMigrations.filter(
    m => m.version > current.version && m.version <= maxVersion && !current.appliedMigrations.includes(m.name)
  );

  if (pendingMigrations.length === 0) {
    logger.info('No pending migrations to apply');
    return {
      success: true,
      applied: [],
      errors: [],
      finalVersion: current.version
    };
  }

  logger.info(`Found ${pendingMigrations.length} pending migrations`, {
    currentVersion: current.version,
    targetVersion: maxVersion
  });

  const applied = [];
  const errors = [];
  let lastSuccessfulVersion = current.version;

  for (const migration of pendingMigrations) {
    const result = await runMigration(migration, 'up');

    if (result.success) {
      applied.push(migration.name);
      lastSuccessfulVersion = migration.version;
      setMigrationVersion(migration.version, migration.name, 'up');
    } else {
      errors.push(`${migration.name}: ${result.error}`);
      logger.error('Migration failed, stopping migration chain', { migration: migration.name });
      break;
    }
  }

  return {
    success: errors.length === 0,
    applied,
    errors,
    finalVersion: lastSuccessfulVersion
  };
}

/**
 * Migrate down to specific version
 * @param {Array} migrations - Array of migration objects sorted by version
 * @param {number} targetVersion - Target version to migrate down to
 * @returns {Promise<{ success: boolean, reverted: string[], errors: string[], finalVersion: number }>}
 */
export async function migrateDown(migrations, targetVersion = 0) {
  const current = getMigrationVersion();
  const sortedMigrations = [...migrations].sort((a, b) => b.version - a.version);

  const migrationsToRevert = sortedMigrations.filter(
    m => m.version > targetVersion && m.version <= current.version && current.appliedMigrations.includes(m.name)
  );

  if (migrationsToRevert.length === 0) {
    logger.info('No migrations to revert');
    return {
      success: true,
      reverted: [],
      errors: [],
      finalVersion: current.version
    };
  }

  logger.info(`Reverting ${migrationsToRevert.length} migrations`, {
    currentVersion: current.version,
    targetVersion
  });

  const reverted = [];
  const errors = [];
  let lastSuccessfulVersion = current.version;

  for (const migration of migrationsToRevert) {
    const result = await runMigration(migration, 'down');

    if (result.success) {
      reverted.push(migration.name);
      lastSuccessfulVersion = migration.version - 1;
      setMigrationVersion(lastSuccessfulVersion, migration.name, 'down');
    } else {
      errors.push(`${migration.name}: ${result.error}`);
      logger.error('Migration rollback failed, stopping rollback chain', { migration: migration.name });
      break;
    }
  }

  return {
    success: errors.length === 0,
    reverted,
    errors,
    finalVersion: lastSuccessfulVersion
  };
}

/**
 * Get migration status
 * @param {Array} migrations - Array of migration objects
 * @returns {{ current: number, pending: string[], applied: string[], total: number }}
 */
export function getMigrationStatus(migrations) {
  const current = getMigrationVersion();
  const sortedMigrations = [...migrations].sort((a, b) => a.version - b.version);

  const pending = sortedMigrations
    .filter(m => !current.appliedMigrations.includes(m.name))
    .map(m => m.name);

  return {
    current: current.version,
    pending,
    applied: current.appliedMigrations,
    total: migrations.length,
    lastMigrationAt: current.lastMigrationAt
  };
}

// ============================================================================
// EXAMPLE MIGRATIONS
// ============================================================================

import { CONFIG } from './config.js';

const CACHE_DIR = CONFIG.CACHE_DIR || join(process.cwd(), 'cache');

/**
 * Example migration: cache_v2
 * Adds 'tags' field to cache entries for better organization
 */
export const migration_cache_v2 = {
  name: 'cache_v2',
  version: 1,
  description: 'Add tags field to cache entries for categorization',

  async up() {
    logger.info('Migration cache_v2 UP: Adding tags field to cache entries');

    if (!existsSync(CACHE_DIR)) {
      logger.info('Cache directory does not exist, skipping migration');
      return;
    }

    const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
    let migrated = 0;
    let skipped = 0;

    for (const file of files) {
      const filePath = join(CACHE_DIR, file);
      try {
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));

        // Skip if already has tags field
        if (data.tags !== undefined) {
          skipped++;
          continue;
        }

        // Add tags field based on source/model
        const tags = [];
        if (data.source) tags.push(`source:${data.source}`);
        if (data.model) tags.push(`model:${data.model}`);
        if (data.encrypted) tags.push('encrypted');

        data.tags = tags;
        data.schemaVersion = 2;

        writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        migrated++;
      } catch (error) {
        logger.warn(`Failed to migrate cache file: ${file}`, { error: error.message });
      }
    }

    logger.info('Migration cache_v2 UP completed', { migrated, skipped, total: files.length });
  },

  async down() {
    logger.info('Migration cache_v2 DOWN: Removing tags field from cache entries');

    if (!existsSync(CACHE_DIR)) {
      logger.info('Cache directory does not exist, skipping rollback');
      return;
    }

    const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
    let reverted = 0;

    for (const file of files) {
      const filePath = join(CACHE_DIR, file);
      try {
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));

        // Remove tags field and schemaVersion
        if (data.tags !== undefined) {
          delete data.tags;
          delete data.schemaVersion;
          writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
          reverted++;
        }
      } catch (error) {
        logger.warn(`Failed to revert cache file: ${file}`, { error: error.message });
      }
    }

    logger.info('Migration cache_v2 DOWN completed', { reverted, total: files.length });
  }
};

/**
 * All registered migrations
 */
export const MIGRATIONS = [
  migration_cache_v2
];

/**
 * Run all pending migrations
 * @returns {Promise<{ success: boolean, applied: string[], errors: string[], finalVersion: number }>}
 */
export async function runAllMigrations() {
  return migrateUp(MIGRATIONS);
}

/**
 * Rollback to specific version
 * @param {number} targetVersion - Target version
 * @returns {Promise<{ success: boolean, reverted: string[], errors: string[], finalVersion: number }>}
 */
export async function rollbackTo(targetVersion) {
  return migrateDown(MIGRATIONS, targetVersion);
}
