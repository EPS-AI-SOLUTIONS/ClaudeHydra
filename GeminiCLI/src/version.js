import { readFileSync } from 'node:fs';
import { createLogger } from './logger.js';

const logger = createLogger('version');
const PACKAGE_JSON_URL = new URL('../package.json', import.meta.url);

const readPackageJson = () => {
  try {
    return JSON.parse(readFileSync(PACKAGE_JSON_URL, 'utf-8'));
  } catch (error) {
    logger.error('Failed to read package.json', { error: error.message });
    return {};
  }
};

export const resolveServerVersion = () => {
  const npmPackageVersion = process.env.npm_package_version;
  if (npmPackageVersion) {
    return npmPackageVersion;
  }
  const packageJson = readPackageJson();
  return packageJson.version ?? '0.0.0';
};

export const resolveNodeEngines = () => {
  const packageJson = readPackageJson();
  return packageJson.engines?.node ?? null;
};
