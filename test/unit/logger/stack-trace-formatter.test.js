/**
 * @fileoverview Tests for stack-trace-formatter module
 */

import {
  formatStackTrace,
  getStackFormatter,
  parseStackFrame,
  parseStackTrace,
  resetStackFormatter,
  StackTraceFormatter,
} from '../../../src/logger/stack-trace-formatter.js';

describe('StackTraceFormatter', () => {
  let formatter;

  beforeEach(() => {
    resetStackFormatter();
    formatter = new StackTraceFormatter({
      useColors: false,
      showNodeModules: false,
      showInternals: false,
      maxFrames: 10,
    });
  });

  describe('parseStackFrame', () => {
    test('should parse standard V8 stack frame', () => {
      const line = '    at functionName (/path/to/file.js:10:5)';
      const frame = parseStackFrame(line);

      expect(frame).not.toBeNull();
      expect(frame.functionName).toBe('functionName');
      expect(frame.filePath).toBe('/path/to/file.js');
      expect(frame.lineNumber).toBe(10);
      expect(frame.columnNumber).toBe(5);
    });

    test('should parse anonymous function frame', () => {
      const line = '    at /path/to/file.js:20:10';
      const frame = parseStackFrame(line);

      expect(frame).not.toBeNull();
      expect(frame.functionName).toBe('<anonymous>');
      expect(frame.filePath).toBe('/path/to/file.js');
      expect(frame.lineNumber).toBe(20);
    });

    test('should parse native code frame', () => {
      const line = '    at Array.forEach (native)';
      const frame = parseStackFrame(line);

      expect(frame).not.toBeNull();
      expect(frame.functionName).toBe('Array.forEach');
      expect(frame.isNative).toBe(true);
    });

    test('should identify node_modules frames', () => {
      const line = '    at fn (/project/node_modules/package/index.js:5:3)';
      const frame = parseStackFrame(line);

      expect(frame).not.toBeNull();
      expect(frame.isNodeModule).toBe(true);
      expect(frame.isApp).toBe(false);
    });

    test('should identify application code frames', () => {
      const line = '    at fn (/project/src/app.js:5:3)';
      const frame = parseStackFrame(line);

      expect(frame).not.toBeNull();
      expect(frame.isNodeModule).toBe(false);
      expect(frame.isApp).toBe(true);
    });
  });

  describe('parseStackTrace', () => {
    test('should parse multiple frames from stack trace', () => {
      const stack = `Error: Test error
    at functionOne (/path/file1.js:10:5)
    at functionTwo (/path/file2.js:20:10)
    at functionThree (/path/file3.js:30:15)`;

      const frames = parseStackTrace(stack);

      expect(frames.length).toBe(3);
      expect(frames[0].functionName).toBe('functionOne');
      expect(frames[1].functionName).toBe('functionTwo');
      expect(frames[2].functionName).toBe('functionThree');
    });

    test('should return empty array for null/undefined stack', () => {
      expect(parseStackTrace(null)).toEqual([]);
      expect(parseStackTrace(undefined)).toEqual([]);
      expect(parseStackTrace('')).toEqual([]);
    });

    test('should skip error message line', () => {
      const stack = `Error: This is the error message
    at fn (/path/file.js:10:5)`;

      const frames = parseStackTrace(stack);

      expect(frames.length).toBe(1);
      expect(frames[0].functionName).toBe('fn');
    });
  });

  describe('StackTraceFormatter', () => {
    test('should format stack trace', () => {
      const error = new Error('Test error');
      const formatted = formatter.format(error);

      expect(formatted).toContain('Stack Trace');
    });

    test('should filter node_modules frames by default', () => {
      const stack = `Error: Test
    at app (/project/src/app.js:10:5)
    at pkg (/project/node_modules/pkg/index.js:20:10)
    at app2 (/project/src/app2.js:30:15)`;

      const formatted = formatter.format(stack);

      expect(formatted).toContain('app');
      expect(formatted).toContain('app2');
      expect(formatted).not.toContain('node_modules');
    });

    test('should show node_modules frames when enabled', () => {
      formatter.showNodeModules = true;
      const stack = `Error: Test
    at app (/project/src/app.js:10:5)
    at pkg (/project/node_modules/pkg/index.js:20:10)`;

      const formatted = formatter.format(stack);

      expect(formatted).toContain('app');
      expect(formatted).toContain('pkg');
    });

    test('should limit number of frames', () => {
      formatter.maxFrames = 2;
      const stack = `Error: Test
    at f1 (/path/f1.js:1:1)
    at f2 (/path/f2.js:2:2)
    at f3 (/path/f3.js:3:3)
    at f4 (/path/f4.js:4:4)`;

      const formatted = formatter.format(stack);

      expect(formatted).toContain('f1');
      expect(formatted).toContain('f2');
      expect(formatted).toContain('more frame');
    });
  });

  describe('getErrorLocation', () => {
    test('should return location of first app frame', () => {
      const error = new Error('Test error');
      const location = formatter.getErrorLocation(error);

      // Should contain file and line info
      expect(typeof location).toBe('string');
    });
  });

  describe('singleton functions', () => {
    test('getStackFormatter should return formatter instance', () => {
      const f = getStackFormatter();
      expect(f).toBeInstanceOf(StackTraceFormatter);
    });

    test('resetStackFormatter should create new instance', () => {
      const f1 = getStackFormatter();
      resetStackFormatter();
      const f2 = getStackFormatter();
      expect(f1).not.toBe(f2);
    });

    test('formatStackTrace convenience function should work', () => {
      resetStackFormatter();
      const error = new Error('Test');
      const result = formatStackTrace(error);
      expect(result).toContain('Stack Trace');
    });
  });
});
