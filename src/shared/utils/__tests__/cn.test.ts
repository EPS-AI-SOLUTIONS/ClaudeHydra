import { cn } from '@jaskier/ui';
import { describe, expect, it } from 'vitest';

describe('cn utility', () => {
  it('returns an empty string when called with no arguments', () => {
    expect(cn()).toBe('');
  });

  it('passes through a single class string', () => {
    expect(cn('px-4')).toBe('px-4');
  });

  it('merges multiple class strings', () => {
    const result = cn('px-4', 'py-2');
    expect(result).toContain('px-4');
    expect(result).toContain('py-2');
  });

  it('handles conditional classes via clsx-style objects', () => {
    expect(cn({ 'bg-red-500': true, 'bg-blue-500': false })).toBe('bg-red-500');
  });

  it('handles arrays of class values', () => {
    const result = cn(['px-4', 'py-2']);
    expect(result).toContain('px-4');
    expect(result).toContain('py-2');
  });

  it('deduplicates conflicting Tailwind utilities (tailwind-merge)', () => {
    // tailwind-merge should resolve conflicting px values to the last one
    expect(cn('px-4', 'px-8')).toBe('px-8');
  });

  it('merges conflicting background colors', () => {
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
  });

  it('filters out falsy values', () => {
    expect(cn('px-4', undefined, null, false, '', 'py-2')).toBe('px-4 py-2');
  });

  it('handles a mix of strings, objects, and arrays', () => {
    const result = cn('base', ['arr-class'], { 'obj-class': true, hidden: false });
    expect(result).toContain('base');
    expect(result).toContain('arr-class');
    expect(result).toContain('obj-class');
    expect(result).not.toContain('hidden');
  });
});
