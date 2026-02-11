import { describe, expect, it } from 'vitest';
import { formatBytes, formatNumber, formatSimilarity, formatSizeGB } from './format';

describe('format utilities', () => {
  describe('formatBytes', () => {
    it('should return empty string for undefined', () => {
      expect(formatBytes(undefined)).toBe('');
    });

    it('should return empty string for null', () => {
      expect(formatBytes(null)).toBe('');
    });

    it('should return empty string for NaN', () => {
      expect(formatBytes(NaN)).toBe('');
    });

    it('should return empty string for zero', () => {
      expect(formatBytes(0)).toBe('');
    });

    it('should return empty string for negative numbers', () => {
      expect(formatBytes(-100)).toBe('');
    });

    it('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1.0KB');
      expect(formatBytes(1536)).toBe('1.5KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0MB');
      expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0GB');
      expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5GB');
    });

    it('should format terabytes correctly', () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.0TB');
    });
  });

  describe('formatSizeGB', () => {
    it('should return empty string for undefined', () => {
      expect(formatSizeGB(undefined)).toBe('');
    });

    it('should return empty string for null', () => {
      expect(formatSizeGB(null)).toBe('');
    });

    it('should return empty string for NaN', () => {
      expect(formatSizeGB(NaN)).toBe('');
    });

    it('should return empty string for zero', () => {
      expect(formatSizeGB(0)).toBe('');
    });

    it('should return empty string for negative numbers', () => {
      expect(formatSizeGB(-1000000)).toBe('');
    });

    it('should format to GB with one decimal', () => {
      const oneGB = 1024 * 1024 * 1024;
      expect(formatSizeGB(oneGB)).toBe('1.0GB');
      expect(formatSizeGB(oneGB * 2.5)).toBe('2.5GB');
    });

    it('should format small sizes as fractional GB', () => {
      const halfGB = 512 * 1024 * 1024;
      expect(formatSizeGB(halfGB)).toBe('0.5GB');
    });

    it('should handle large model sizes (typical Ollama models)', () => {
      // llama3.2:1b ~ 1.3GB
      expect(formatSizeGB(1.3 * 1024 * 1024 * 1024)).toBe('1.3GB');
      // llama3.2:7b ~ 4.7GB
      expect(formatSizeGB(4.7 * 1024 * 1024 * 1024)).toBe('4.7GB');
    });
  });

  describe('formatNumber', () => {
    it('should return fallback for undefined', () => {
      expect(formatNumber(undefined)).toBe('0');
      expect(formatNumber(undefined, 2, 'N/A')).toBe('N/A');
    });

    it('should return fallback for null', () => {
      expect(formatNumber(null)).toBe('0');
      expect(formatNumber(null, 0, '-')).toBe('-');
    });

    it('should return fallback for NaN', () => {
      expect(formatNumber(NaN)).toBe('0');
    });

    it('should format numbers with default 0 decimals', () => {
      expect(formatNumber(42)).toBe('42');
      expect(formatNumber(42.7)).toBe('43');
    });

    it('should format numbers with specified decimals', () => {
      expect(formatNumber(42.567, 2)).toBe('42.57');
      expect(formatNumber(42.5, 3)).toBe('42.500');
    });

    it('should handle negative numbers', () => {
      expect(formatNumber(-10.5, 1)).toBe('-10.5');
    });

    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(0, 2)).toBe('0.00');
    });
  });

  describe('formatSimilarity', () => {
    it('should return "0" for undefined', () => {
      expect(formatSimilarity(undefined)).toBe('0');
    });

    it('should return "0" for null', () => {
      expect(formatSimilarity(null)).toBe('0');
    });

    it('should return "0" for NaN', () => {
      expect(formatSimilarity(NaN)).toBe('0');
    });

    it('should format similarity percentages without decimals', () => {
      expect(formatSimilarity(85)).toBe('85');
      expect(formatSimilarity(85.7)).toBe('86');
      expect(formatSimilarity(100)).toBe('100');
    });

    it('should handle zero similarity', () => {
      expect(formatSimilarity(0)).toBe('0');
    });

    it('should handle fractional similarities', () => {
      expect(formatSimilarity(0.5)).toBe('1');
      expect(formatSimilarity(99.9)).toBe('100');
    });
  });
});
