/**
 * Macro Recorder for input automation
 * Based on src/cli-enhanced/input-enhancer.js macro features
 * @module cli-unified/input/MacroRecorder
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { DATA_DIR } from '../core/constants.js';

const MACROS_FILE = join(homedir(), DATA_DIR, 'macros', 'macros.json');

/**
 * Macro Recorder class
 */
export class MacroRecorder extends EventEmitter {
  constructor(options = {}) {
    super();

    this.macros = {};
    this.recording = false;
    this.currentMacro = null;
    this.recordBuffer = [];
    this.macrosFile = options.macrosFile || MACROS_FILE;

    this._loadMacros();
  }

  /**
   * Load macros from disk
   */
  _loadMacros() {
    try {
      if (existsSync(this.macrosFile)) {
        this.macros = JSON.parse(readFileSync(this.macrosFile, 'utf-8'));
      }
    } catch {
      this.macros = {};
    }
  }

  /**
   * Save macros to disk
   */
  _saveMacros() {
    try {
      const dir = dirname(this.macrosFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.macrosFile, JSON.stringify(this.macros, null, 2));
    } catch (error) {
      console.error('Failed to save macros:', error.message);
    }
  }

  /**
   * Start recording a macro
   */
  startRecording(name) {
    if (this.recording) {
      throw new Error('Already recording a macro');
    }

    this.recording = true;
    this.currentMacro = name;
    this.recordBuffer = [];
    this.emit('recordStart', name);
  }

  /**
   * Stop recording and save macro
   */
  stopRecording() {
    if (!this.recording) {
      return null;
    }

    const name = this.currentMacro;
    const actions = [...this.recordBuffer];

    this.macros[name] = {
      name,
      actions,
      createdAt: new Date().toISOString()
    };

    this._saveMacros();

    this.recording = false;
    this.currentMacro = null;
    this.recordBuffer = [];

    this.emit('recordStop', name, actions);
    return { name, actions };
  }

  /**
   * Cancel recording
   */
  cancelRecording() {
    if (!this.recording) return;

    const name = this.currentMacro;
    this.recording = false;
    this.currentMacro = null;
    this.recordBuffer = [];

    this.emit('recordCancel', name);
  }

  /**
   * Record an action
   */
  recordAction(action) {
    if (!this.recording) return;

    this.recordBuffer.push({
      type: action.type,
      data: action.data,
      timestamp: Date.now()
    });

    this.emit('actionRecorded', action);
  }

  /**
   * Get macro by name
   */
  get(name) {
    return this.macros[name] || null;
  }

  /**
   * List all macros
   */
  list() {
    return Object.entries(this.macros).map(([key, macro]) => ({
      key,
      name: macro.name,
      actionCount: macro.actions.length,
      createdAt: macro.createdAt
    }));
  }

  /**
   * Execute a macro
   */
  async execute(name, context = {}) {
    const macro = this.macros[name];
    if (!macro) {
      throw new Error(`Macro not found: ${name}`);
    }

    const results = [];
    this.emit('executeStart', name);

    for (const action of macro.actions) {
      try {
        const result = await this._executeAction(action, context);
        results.push({ action, result, success: true });
        this.emit('actionExecuted', action, result);
      } catch (error) {
        results.push({ action, error: error.message, success: false });
        this.emit('actionFailed', action, error);

        // Stop on error by default
        if (!context.continueOnError) {
          break;
        }
      }
    }

    this.emit('executeComplete', name, results);
    return results;
  }

  /**
   * Execute a single action
   */
  async _executeAction(action, context) {
    switch (action.type) {
      case 'input':
        return { type: 'input', text: action.data };

      case 'command':
        return { type: 'command', command: action.data };

      case 'wait':
        await new Promise(resolve => setTimeout(resolve, action.data));
        return { type: 'wait', duration: action.data };

      case 'template':
        return { type: 'template', name: action.data.name, vars: action.data.vars };

      default:
        return { type: action.type, data: action.data };
    }
  }

  /**
   * Delete a macro
   */
  delete(name) {
    if (!this.macros[name]) {
      return false;
    }

    delete this.macros[name];
    this._saveMacros();
    this.emit('macroDeleted', name);
    return true;
  }

  /**
   * Rename a macro
   */
  rename(oldName, newName) {
    if (!this.macros[oldName]) {
      throw new Error(`Macro not found: ${oldName}`);
    }

    if (this.macros[newName]) {
      throw new Error(`Macro already exists: ${newName}`);
    }

    this.macros[newName] = {
      ...this.macros[oldName],
      name: newName
    };
    delete this.macros[oldName];

    this._saveMacros();
    this.emit('macroRenamed', oldName, newName);
  }

  /**
   * Check if recording
   */
  get isRecording() {
    return this.recording;
  }

  /**
   * Get current recording name
   */
  get currentRecordingName() {
    return this.currentMacro;
  }

  /**
   * Get macro count
   */
  get count() {
    return Object.keys(this.macros).length;
  }

  /**
   * Check if macro exists
   */
  has(name) {
    return name in this.macros;
  }

  /**
   * Clear all macros
   */
  clear() {
    this.macros = {};
    this._saveMacros();
    this.emit('macrosCleared');
  }
}

export function createMacroRecorder(options) {
  return new MacroRecorder(options);
}

export default MacroRecorder;
