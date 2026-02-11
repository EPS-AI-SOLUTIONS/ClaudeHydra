/**
 * MacroRecorder Tests
 * @module test/unit/cli-unified/input/MacroRecorder.test
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock constants
vi.mock('../../../../src/cli-unified/core/constants.js', () => ({
  DATA_DIR: '.claude-test',
}));

import {
  createMacroRecorder,
  MacroRecorder,
} from '../../../../src/cli-unified/input/MacroRecorder.js';

describe('MacroRecorder', () => {
  let recorder;

  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(false);
    recorder = new MacroRecorder({ macrosFile: '/test/macros.json' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create recorder instance', () => {
      expect(recorder).toBeInstanceOf(MacroRecorder);
    });

    it('should load existing macros from file', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(
        JSON.stringify({
          testMacro: {
            name: 'testMacro',
            actions: [{ type: 'input', data: 'test' }],
            createdAt: '2024-01-01T00:00:00Z',
          },
        }),
      );

      const rec = new MacroRecorder({ macrosFile: '/test/macros.json' });

      expect(rec.has('testMacro')).toBe(true);
    });

    it('should handle invalid JSON gracefully', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('invalid json');

      const rec = new MacroRecorder({ macrosFile: '/test/macros.json' });

      expect(rec.count).toBe(0);
    });

    it('should initialize with empty macros', () => {
      expect(recorder.count).toBe(0);
      expect(recorder.isRecording).toBe(false);
    });
  });

  // ===========================================================================
  // Recording Tests
  // ===========================================================================

  describe('startRecording()', () => {
    it('should start recording with given name', () => {
      recorder.startRecording('myMacro');

      expect(recorder.isRecording).toBe(true);
      expect(recorder.currentRecordingName).toBe('myMacro');
    });

    it('should emit recordStart event', () => {
      const spy = vi.fn();
      recorder.on('recordStart', spy);

      recorder.startRecording('myMacro');

      expect(spy).toHaveBeenCalledWith('myMacro');
    });

    it('should throw when already recording', () => {
      recorder.startRecording('first');

      expect(() => recorder.startRecording('second')).toThrow('Already recording a macro');
    });
  });

  describe('stopRecording()', () => {
    it('should stop recording and save macro', () => {
      recorder.startRecording('myMacro');
      recorder.recordAction({ type: 'input', data: 'test' });

      const result = recorder.stopRecording();

      expect(result.name).toBe('myMacro');
      expect(result.actions.length).toBe(1);
      expect(recorder.isRecording).toBe(false);
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should return null when not recording', () => {
      const result = recorder.stopRecording();

      expect(result).toBeNull();
    });

    it('should emit recordStop event', () => {
      const spy = vi.fn();
      recorder.on('recordStop', spy);

      recorder.startRecording('myMacro');
      recorder.stopRecording();

      expect(spy).toHaveBeenCalledWith('myMacro', expect.any(Array));
    });

    it('should create directory if not exists', () => {
      existsSync.mockImplementation((path) => {
        if (path === '/test') return false;
        return false;
      });

      recorder.startRecording('myMacro');
      recorder.stopRecording();

      expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
  });

  describe('cancelRecording()', () => {
    it('should cancel without saving', () => {
      recorder.startRecording('myMacro');
      recorder.recordAction({ type: 'input', data: 'test' });
      recorder.cancelRecording();

      expect(recorder.isRecording).toBe(false);
      expect(recorder.has('myMacro')).toBe(false);
      expect(writeFileSync).not.toHaveBeenCalled();
    });

    it('should do nothing when not recording', () => {
      recorder.cancelRecording();
      // Should not throw
      expect(recorder.isRecording).toBe(false);
    });

    it('should emit recordCancel event', () => {
      const spy = vi.fn();
      recorder.on('recordCancel', spy);

      recorder.startRecording('myMacro');
      recorder.cancelRecording();

      expect(spy).toHaveBeenCalledWith('myMacro');
    });
  });

  describe('recordAction()', () => {
    it('should record action when recording', () => {
      recorder.startRecording('myMacro');
      recorder.recordAction({ type: 'input', data: 'hello' });
      recorder.recordAction({ type: 'command', data: '/help' });

      const result = recorder.stopRecording();

      expect(result.actions.length).toBe(2);
      expect(result.actions[0].type).toBe('input');
      expect(result.actions[1].type).toBe('command');
    });

    it('should do nothing when not recording', () => {
      recorder.recordAction({ type: 'input', data: 'test' });
      // Should not throw, and count should still be 0
      expect(recorder.count).toBe(0);
    });

    it('should add timestamp to actions', () => {
      recorder.startRecording('myMacro');
      recorder.recordAction({ type: 'input', data: 'test' });

      const result = recorder.stopRecording();

      expect(result.actions[0].timestamp).toBeDefined();
      expect(typeof result.actions[0].timestamp).toBe('number');
    });

    it('should emit actionRecorded event', () => {
      const spy = vi.fn();
      recorder.on('actionRecorded', spy);

      recorder.startRecording('myMacro');
      recorder.recordAction({ type: 'input', data: 'test' });

      expect(spy).toHaveBeenCalledWith({ type: 'input', data: 'test' });
    });
  });

  // ===========================================================================
  // Macro Management Tests
  // ===========================================================================

  describe('get()', () => {
    it('should return macro by name', () => {
      recorder.startRecording('myMacro');
      recorder.recordAction({ type: 'input', data: 'test' });
      recorder.stopRecording();

      const macro = recorder.get('myMacro');

      expect(macro).not.toBeNull();
      expect(macro.name).toBe('myMacro');
    });

    it('should return null for non-existent macro', () => {
      expect(recorder.get('nonexistent')).toBeNull();
    });
  });

  describe('list()', () => {
    it('should return list of all macros', () => {
      recorder.startRecording('macro1');
      recorder.stopRecording();

      recorder.startRecording('macro2');
      recorder.recordAction({ type: 'input', data: 'test' });
      recorder.stopRecording();

      const list = recorder.list();

      expect(list.length).toBe(2);
      expect(list[0]).toHaveProperty('key');
      expect(list[0]).toHaveProperty('name');
      expect(list[0]).toHaveProperty('actionCount');
      expect(list[0]).toHaveProperty('createdAt');
    });

    it('should return empty array when no macros', () => {
      expect(recorder.list()).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('should delete existing macro', () => {
      recorder.startRecording('myMacro');
      recorder.stopRecording();

      const result = recorder.delete('myMacro');

      expect(result).toBe(true);
      expect(recorder.has('myMacro')).toBe(false);
    });

    it('should return false for non-existent macro', () => {
      expect(recorder.delete('nonexistent')).toBe(false);
    });

    it('should emit macroDeleted event', () => {
      const spy = vi.fn();
      recorder.on('macroDeleted', spy);

      recorder.startRecording('myMacro');
      recorder.stopRecording();
      recorder.delete('myMacro');

      expect(spy).toHaveBeenCalledWith('myMacro');
    });
  });

  describe('rename()', () => {
    it('should rename existing macro', () => {
      recorder.startRecording('oldName');
      recorder.stopRecording();

      recorder.rename('oldName', 'newName');

      expect(recorder.has('oldName')).toBe(false);
      expect(recorder.has('newName')).toBe(true);
    });

    it('should throw when source macro not found', () => {
      expect(() => recorder.rename('nonexistent', 'newName')).toThrow(
        'Macro not found: nonexistent',
      );
    });

    it('should throw when target name already exists', () => {
      recorder.startRecording('macro1');
      recorder.stopRecording();
      recorder.startRecording('macro2');
      recorder.stopRecording();

      expect(() => recorder.rename('macro1', 'macro2')).toThrow('Macro already exists: macro2');
    });

    it('should emit macroRenamed event', () => {
      const spy = vi.fn();
      recorder.on('macroRenamed', spy);

      recorder.startRecording('oldName');
      recorder.stopRecording();
      recorder.rename('oldName', 'newName');

      expect(spy).toHaveBeenCalledWith('oldName', 'newName');
    });
  });

  describe('has()', () => {
    it('should return true for existing macro', () => {
      recorder.startRecording('myMacro');
      recorder.stopRecording();

      expect(recorder.has('myMacro')).toBe(true);
    });

    it('should return false for non-existent macro', () => {
      expect(recorder.has('nonexistent')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('should remove all macros', () => {
      recorder.startRecording('macro1');
      recorder.stopRecording();
      recorder.startRecording('macro2');
      recorder.stopRecording();

      recorder.clear();

      expect(recorder.count).toBe(0);
    });

    it('should emit macrosCleared event', () => {
      const spy = vi.fn();
      recorder.on('macrosCleared', spy);

      recorder.clear();

      expect(spy).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Execution Tests
  // ===========================================================================

  describe('execute()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should execute macro actions', async () => {
      recorder.startRecording('myMacro');
      recorder.recordAction({ type: 'input', data: 'hello' });
      recorder.recordAction({ type: 'command', data: '/help' });
      recorder.stopRecording();

      const results = await recorder.execute('myMacro');

      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should throw for non-existent macro', async () => {
      await expect(recorder.execute('nonexistent')).rejects.toThrow('Macro not found: nonexistent');
    });

    it('should emit events during execution', async () => {
      const startSpy = vi.fn();
      const actionSpy = vi.fn();
      const completeSpy = vi.fn();

      recorder.on('executeStart', startSpy);
      recorder.on('actionExecuted', actionSpy);
      recorder.on('executeComplete', completeSpy);

      recorder.startRecording('myMacro');
      recorder.recordAction({ type: 'input', data: 'test' });
      recorder.stopRecording();

      await recorder.execute('myMacro');

      expect(startSpy).toHaveBeenCalledWith('myMacro');
      expect(actionSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });

    it('should handle wait action', async () => {
      recorder.startRecording('myMacro');
      recorder.recordAction({ type: 'wait', data: 100 });
      recorder.stopRecording();

      const promise = recorder.execute('myMacro');
      vi.advanceTimersByTime(100);

      const results = await promise;

      expect(results[0].result.type).toBe('wait');
      expect(results[0].result.duration).toBe(100);
    });

    it('should handle template action', async () => {
      recorder.startRecording('myMacro');
      recorder.recordAction({
        type: 'template',
        data: { name: 'greeting', vars: { name: 'World' } },
      });
      recorder.stopRecording();

      const results = await recorder.execute('myMacro');

      expect(results[0].result.type).toBe('template');
      expect(results[0].result.name).toBe('greeting');
    });

    it('should stop on error by default', async () => {
      // Create a custom error-throwing scenario
      recorder.startRecording('myMacro');
      recorder.recordAction({ type: 'input', data: 'first' });
      recorder.recordAction({ type: 'input', data: 'second' });
      recorder.stopRecording();

      // Override _executeAction to throw on first action
      const originalExecute = recorder._executeAction.bind(recorder);
      let callCount = 0;
      recorder._executeAction = async (action, context) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Test error');
        }
        return originalExecute(action, context);
      };

      const results = await recorder.execute('myMacro');

      // Should stop after first error
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
    });

    it('should continue on error when specified', async () => {
      recorder.startRecording('myMacro');
      recorder.recordAction({ type: 'input', data: 'first' });
      recorder.recordAction({ type: 'input', data: 'second' });
      recorder.stopRecording();

      // Override _executeAction to throw on first action
      const originalExecute = recorder._executeAction.bind(recorder);
      let callCount = 0;
      recorder._executeAction = async (action, context) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Test error');
        }
        return originalExecute(action, context);
      };

      const results = await recorder.execute('myMacro', { continueOnError: true });

      expect(results.length).toBe(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });
  });

  // ===========================================================================
  // Property Tests
  // ===========================================================================

  describe('isRecording', () => {
    it('should return true when recording', () => {
      recorder.startRecording('myMacro');

      expect(recorder.isRecording).toBe(true);
    });

    it('should return false when not recording', () => {
      expect(recorder.isRecording).toBe(false);
    });
  });

  describe('currentRecordingName', () => {
    it('should return current macro name when recording', () => {
      recorder.startRecording('myMacro');

      expect(recorder.currentRecordingName).toBe('myMacro');
    });

    it('should return null when not recording', () => {
      expect(recorder.currentRecordingName).toBeNull();
    });
  });

  describe('count', () => {
    it('should return number of macros', () => {
      expect(recorder.count).toBe(0);

      recorder.startRecording('macro1');
      recorder.stopRecording();

      expect(recorder.count).toBe(1);

      recorder.startRecording('macro2');
      recorder.stopRecording();

      expect(recorder.count).toBe(2);
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createMacroRecorder()', () => {
    it('should create new MacroRecorder instance', () => {
      const rec = createMacroRecorder({ macrosFile: '/test/macros.json' });

      expect(rec).toBeInstanceOf(MacroRecorder);
    });
  });
});
