/**
 * SpinnerSystem Tests
 * @module test/unit/cli-unified/output/SpinnerSystem.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ora
const mockOra = {
  start: vi.fn().mockReturnThis(),
  stop: vi.fn().mockReturnThis(),
  succeed: vi.fn().mockReturnThis(),
  fail: vi.fn().mockReturnThis(),
  warn: vi.fn().mockReturnThis(),
  info: vi.fn().mockReturnThis(),
  clear: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  text: '',
  color: 'cyan',
  spinner: {},
  prefixText: '',
  suffixText: ''
};

vi.mock('ora', () => ({
  default: vi.fn(() => mockOra)
}));

// Mock ThemeRegistry
vi.mock('../../../../src/cli-unified/core/ThemeRegistry.js', () => ({
  themeRegistry: {
    getCurrent: vi.fn(() => ({
      spinnerType: 'dots',
      spinner: null,
      colors: {
        primary: vi.fn(s => s),
        success: vi.fn(s => s),
        dim: vi.fn(s => s),
        highlight: vi.fn(s => s)
      }
    }))
  }
}));

import {
  SpinnerTypes,
  getSpinnerType,
  getAvailableSpinnerTypes,
  Spinner,
  ProgressBar,
  MultiSpinner,
  AnimatedText,
  createSpinner,
  createTypedSpinner,
  createProgressBar,
  createMultiSpinner
} from '../../../../src/cli-unified/output/SpinnerSystem.js';

describe('SpinnerSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // SpinnerTypes Tests
  // ===========================================================================

  describe('SpinnerTypes', () => {
    it('should define dots spinner', () => {
      expect(SpinnerTypes.dots).toBeDefined();
      expect(SpinnerTypes.dots.interval).toBe(80);
      expect(Array.isArray(SpinnerTypes.dots.frames)).toBe(true);
    });

    it('should define classic spinner', () => {
      expect(SpinnerTypes.classic).toBeDefined();
      expect(SpinnerTypes.classic.frames).toEqual(['|', '/', '-', '\\']);
    });

    it('should define witcher spinner', () => {
      expect(SpinnerTypes.witcher).toBeDefined();
      expect(SpinnerTypes.witcher.frames.length).toBe(4);
    });

    it('should define hydra spinner', () => {
      expect(SpinnerTypes.hydra).toBeDefined();
      expect(SpinnerTypes.hydra.interval).toBe(100);
    });

    it('should have all expected spinner types', () => {
      const expectedTypes = [
        'dots', 'dots2', 'dots3', 'line', 'line2', 'circle', 'circle2', 'circle3',
        'square', 'square2', 'square3', 'bounce', 'bounce2', 'pulse', 'pulse2',
        'wave', 'wave2', 'arrow', 'arrow2', 'arrow3', 'clock', 'moon', 'earth',
        'toggle', 'toggle2', 'boxBounce', 'boxBounce2', 'triangle', 'binary',
        'aesthetic', 'star', 'growVertical', 'growHorizontal', 'noise', 'point',
        'simpleDots', 'hydra', 'classic', 'witcher', 'cyber'
      ];

      for (const type of expectedTypes) {
        expect(SpinnerTypes[type], `Missing spinner type: ${type}`).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // Helper Functions Tests
  // ===========================================================================

  describe('getSpinnerType()', () => {
    it('should return existing spinner type', () => {
      const result = getSpinnerType('classic');
      expect(result).toBe(SpinnerTypes.classic);
    });

    it('should return dots for unknown type', () => {
      const result = getSpinnerType('nonexistent');
      expect(result).toBe(SpinnerTypes.dots);
    });
  });

  describe('getAvailableSpinnerTypes()', () => {
    it('should return array of spinner type names', () => {
      const types = getAvailableSpinnerTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types).toContain('dots');
      expect(types).toContain('classic');
      expect(types).toContain('witcher');
    });
  });

  // ===========================================================================
  // Spinner Class Tests
  // ===========================================================================

  describe('Spinner', () => {
    describe('constructor', () => {
      it('should create spinner with default options', () => {
        const spinner = new Spinner();
        expect(spinner).toBeInstanceOf(Spinner);
      });

      it('should create spinner with custom text', () => {
        const spinner = new Spinner({ text: 'Loading...' });
        expect(spinner).toBeInstanceOf(Spinner);
      });

      it('should create spinner with custom type', () => {
        const spinner = new Spinner({ type: 'classic' });
        expect(spinner.type).toBe('classic');
      });

      it('should create spinner with custom frames', () => {
        const spinner = new Spinner({ frames: ['a', 'b', 'c'], interval: 100 });
        expect(spinner).toBeInstanceOf(Spinner);
      });
    });

    describe('start()', () => {
      it('should start the spinner', () => {
        const spinner = new Spinner();
        const result = spinner.start();
        expect(mockOra.start).toHaveBeenCalled();
        expect(result).toBe(spinner);
      });

      it('should start with text', () => {
        const spinner = new Spinner();
        spinner.start('Loading...');
        expect(mockOra.start).toHaveBeenCalled();
      });
    });

    describe('stop()', () => {
      it('should stop the spinner', () => {
        const spinner = new Spinner();
        spinner.start();
        const result = spinner.stop();
        expect(mockOra.stop).toHaveBeenCalled();
        expect(result).toBe(spinner);
      });
    });

    describe('succeed()', () => {
      it('should mark as success', () => {
        const spinner = new Spinner();
        spinner.start();
        const result = spinner.succeed('Done!');
        expect(mockOra.succeed).toHaveBeenCalledWith('Done!');
        expect(result).toBe(spinner);
      });
    });

    describe('fail()', () => {
      it('should mark as failed', () => {
        const spinner = new Spinner();
        spinner.start();
        const result = spinner.fail('Error!');
        expect(mockOra.fail).toHaveBeenCalledWith('Error!');
        expect(result).toBe(spinner);
      });
    });

    describe('warn()', () => {
      it('should show warning', () => {
        const spinner = new Spinner();
        const result = spinner.warn('Warning!');
        expect(mockOra.warn).toHaveBeenCalledWith('Warning!');
        expect(result).toBe(spinner);
      });
    });

    describe('info()', () => {
      it('should show info', () => {
        const spinner = new Spinner();
        const result = spinner.info('Info message');
        expect(mockOra.info).toHaveBeenCalledWith('Info message');
        expect(result).toBe(spinner);
      });
    });

    describe('text()', () => {
      it('should set spinner text', () => {
        const spinner = new Spinner();
        const result = spinner.text('New text');
        expect(result).toBe(spinner);
      });
    });

    describe('color()', () => {
      it('should set spinner color', () => {
        const spinner = new Spinner();
        const result = spinner.color('green');
        expect(result).toBe(spinner);
      });
    });

    describe('isSpinning', () => {
      it('should return true when spinning', () => {
        const spinner = new Spinner();
        spinner.start();
        expect(spinner.isSpinning).toBe(true);
      });

      it('should return false when stopped', () => {
        const spinner = new Spinner();
        spinner.start();
        spinner.stop();
        expect(spinner.isSpinning).toBe(false);
      });
    });

    describe('clear()', () => {
      it('should clear spinner output', () => {
        const spinner = new Spinner();
        const result = spinner.clear();
        expect(mockOra.clear).toHaveBeenCalled();
        expect(result).toBe(spinner);
      });
    });

    describe('render()', () => {
      it('should render spinner', () => {
        const spinner = new Spinner();
        const result = spinner.render();
        expect(mockOra.render).toHaveBeenCalled();
        expect(result).toBe(spinner);
      });
    });

    describe('setType()', () => {
      it('should change spinner type', () => {
        const spinner = new Spinner({ type: 'dots' });
        const result = spinner.setType('classic');
        expect(spinner.type).toBe('classic');
        expect(result).toBe(spinner);
      });

      it('should ignore invalid type', () => {
        const spinner = new Spinner({ type: 'dots' });
        spinner.setType('nonexistent');
        expect(spinner.type).toBe('dots');
      });
    });

    describe('setFrames()', () => {
      it('should set custom frames', () => {
        const spinner = new Spinner();
        const result = spinner.setFrames(['x', 'y', 'z'], 100);
        expect(result).toBe(spinner);
      });
    });

    describe('prefixText()', () => {
      it('should set prefix text', () => {
        const spinner = new Spinner();
        const result = spinner.prefixText('[PREFIX]');
        expect(result).toBe(spinner);
      });
    });

    describe('suffixText()', () => {
      it('should set suffix text', () => {
        const spinner = new Spinner();
        const result = spinner.suffixText('[SUFFIX]');
        expect(result).toBe(spinner);
      });
    });
  });

  // ===========================================================================
  // ProgressBar Tests
  // ===========================================================================

  describe('ProgressBar', () => {
    describe('constructor', () => {
      it('should create progress bar with defaults', () => {
        const bar = new ProgressBar();
        expect(bar.total).toBe(100);
        expect(bar.current).toBe(0);
      });

      it('should create progress bar with custom total', () => {
        const bar = new ProgressBar({ total: 50 });
        expect(bar.total).toBe(50);
      });
    });

    describe('update()', () => {
      it('should update current value', () => {
        const bar = new ProgressBar();
        bar.update(50);
        expect(bar.current).toBe(50);
      });

      it('should not exceed total', () => {
        const bar = new ProgressBar({ total: 100 });
        bar.update(150);
        expect(bar.current).toBe(100);
      });

      it('should update label', () => {
        const bar = new ProgressBar();
        const result = bar.update(50, 'Processing...');
        expect(result).toBe(bar);
      });
    });

    describe('increment()', () => {
      it('should increment by 1 by default', () => {
        const bar = new ProgressBar();
        bar.increment();
        expect(bar.current).toBe(1);
      });

      it('should increment by custom amount', () => {
        const bar = new ProgressBar();
        bar.increment(10);
        expect(bar.current).toBe(10);
      });
    });

    describe('complete()', () => {
      it('should set to 100%', () => {
        const bar = new ProgressBar({ total: 100 });
        bar.complete();
        expect(bar.current).toBe(100);
        expect(bar.percent).toBe(1);
      });

      it('should accept custom label', () => {
        const bar = new ProgressBar();
        bar.complete('All done!');
        expect(bar.current).toBe(bar.total);
      });
    });

    describe('percent', () => {
      it('should calculate percentage', () => {
        const bar = new ProgressBar({ total: 100 });
        bar.update(50);
        expect(bar.percent).toBe(0.5);
      });
    });

    describe('finish()', () => {
      it('should output newline', () => {
        const bar = new ProgressBar();
        bar.finish();
        expect(console.log).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // MultiSpinner Tests
  // ===========================================================================

  describe('MultiSpinner', () => {
    describe('add()', () => {
      it('should add spinner with id', () => {
        const multi = new MultiSpinner();
        const spinner = multi.add('task1', { text: 'Task 1' });
        expect(spinner).toBeInstanceOf(Spinner);
      });
    });

    describe('get()', () => {
      it('should return spinner by id', () => {
        const multi = new MultiSpinner();
        const added = multi.add('task1');
        expect(multi.get('task1')).toBe(added);
      });

      it('should return undefined for non-existent id', () => {
        const multi = new MultiSpinner();
        expect(multi.get('nonexistent')).toBeUndefined();
      });
    });

    describe('remove()', () => {
      it('should remove spinner and return true', () => {
        const multi = new MultiSpinner();
        multi.add('task1');
        expect(multi.remove('task1')).toBe(true);
        expect(multi.get('task1')).toBeUndefined();
      });

      it('should return false for non-existent id', () => {
        const multi = new MultiSpinner();
        expect(multi.remove('nonexistent')).toBe(false);
      });
    });

    describe('startAll()', () => {
      it('should start all spinners', () => {
        const multi = new MultiSpinner();
        multi.add('task1');
        multi.add('task2');
        const result = multi.startAll();
        expect(result).toBe(multi);
      });
    });

    describe('stopAll()', () => {
      it('should stop all spinners', () => {
        const multi = new MultiSpinner();
        multi.add('task1');
        multi.add('task2');
        multi.startAll();
        const result = multi.stopAll();
        expect(result).toBe(multi);
      });
    });

    describe('succeedAll()', () => {
      it('should succeed all spinners', () => {
        const multi = new MultiSpinner();
        multi.add('task1');
        multi.add('task2');
        const result = multi.succeedAll('All done!');
        expect(result).toBe(multi);
      });
    });

    describe('failAll()', () => {
      it('should fail all spinners', () => {
        const multi = new MultiSpinner();
        multi.add('task1');
        multi.add('task2');
        const result = multi.failAll('Error!');
        expect(result).toBe(multi);
      });
    });

    describe('activeCount', () => {
      it('should return count of active spinners', () => {
        const multi = new MultiSpinner();
        multi.add('task1');
        multi.add('task2');
        expect(multi.activeCount).toBe(0);
        multi.startAll();
        expect(multi.activeCount).toBe(2);
      });
    });

    describe('ids', () => {
      it('should return array of spinner ids', () => {
        const multi = new MultiSpinner();
        multi.add('task1');
        multi.add('task2');
        expect(multi.ids).toEqual(['task1', 'task2']);
      });
    });
  });

  // ===========================================================================
  // AnimatedText Tests
  // ===========================================================================

  describe('AnimatedText', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('typewriter()', () => {
      it('should output text character by character', async () => {
        const promise = AnimatedText.typewriter('Hi', 10);
        await vi.runAllTimersAsync();
        await promise;
        expect(process.stdout.write).toHaveBeenCalled();
      });
    });

    describe('rainbow()', () => {
      it('should cycle through colors', async () => {
        const promise = AnimatedText.rainbow('Test', 1);
        await vi.runAllTimersAsync();
        await promise;
        expect(process.stdout.write).toHaveBeenCalled();
      });
    });

    describe('pulse()', () => {
      it('should pulse text intensity', async () => {
        const promise = AnimatedText.pulse('Test', 500);
        await vi.runAllTimersAsync();
        await promise;
        expect(process.stdout.write).toHaveBeenCalled();
      });
    });

    describe('slideIn()', () => {
      it('should slide text from right', async () => {
        const promise = AnimatedText.slideIn('Test', 10);
        await vi.runAllTimersAsync();
        await promise;
        expect(process.stdout.write).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Factory Functions Tests
  // ===========================================================================

  describe('Factory Functions', () => {
    describe('createSpinner()', () => {
      it('should create spinner from string', () => {
        const spinner = createSpinner('Loading...');
        expect(spinner).toBeInstanceOf(Spinner);
      });

      it('should create spinner from options', () => {
        const spinner = createSpinner({ text: 'Loading...', color: 'green' });
        expect(spinner).toBeInstanceOf(Spinner);
      });
    });

    describe('createTypedSpinner()', () => {
      it('should create spinner with type', () => {
        const spinner = createTypedSpinner('classic', 'Loading...');
        expect(spinner).toBeInstanceOf(Spinner);
        expect(spinner.type).toBe('classic');
      });
    });

    describe('createProgressBar()', () => {
      it('should create progress bar', () => {
        const bar = createProgressBar({ total: 50 });
        expect(bar).toBeInstanceOf(ProgressBar);
        expect(bar.total).toBe(50);
      });
    });

    describe('createMultiSpinner()', () => {
      it('should create multi spinner manager', () => {
        const multi = createMultiSpinner();
        expect(multi).toBeInstanceOf(MultiSpinner);
      });
    });
  });
});
