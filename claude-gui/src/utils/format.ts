/**
 * Formatting utilities for display values
 */

/**
 * Format bytes to human-readable size string
 * Returns empty string for invalid inputs (undefined, null, NaN, <= 0)
 */
export function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes) || bytes <= 0) {
    return '';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

/**
 * Format bytes to GB specifically (for model sizes display)
 * Returns empty string for invalid inputs
 */
export function formatSizeGB(bytes?: number | null): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes) || bytes <= 0) {
    return '';
  }
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)}GB`;
}

/**
 * Format a number with optional decimal places
 * Returns fallback value for invalid inputs
 */
export function formatNumber(
  value?: number | null,
  decimals: number = 0,
  fallback: string = '0',
): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return fallback;
  }
  return value.toFixed(decimals);
}

/**
 * Format similarity percentage for display
 * Returns '0' for invalid inputs
 */
export function formatSimilarity(similarity?: number | null): string {
  return formatNumber(similarity, 0, '0');
}
