/**
 * Context Manager for file and URL handling
 * Based on src/cli-enhanced/context-manager.js
 * @module cli-unified/processing/ContextManager
 */

import { EventEmitter } from 'events';
import { readFileSync, existsSync, statSync, watch } from 'fs';
import { basename, extname, resolve } from 'path';
import { eventBus, EVENT_TYPES } from '../core/EventBus.js';

/**
 * Language mappings for syntax highlighting hints
 */
const LANGUAGE_MAP = {
  '.js': 'javascript',
  '.ts': 'typescript',
  '.jsx': 'jsx',
  '.tsx': 'tsx',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.r': 'r',
  '.sql': 'sql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.ps1': 'powershell',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.md': 'markdown',
  '.txt': 'text'
};

/**
 * Project type detection patterns
 */
const PROJECT_PATTERNS = {
  nodejs: ['package.json', 'node_modules'],
  python: ['requirements.txt', 'setup.py', 'pyproject.toml'],
  rust: ['Cargo.toml'],
  go: ['go.mod'],
  java: ['pom.xml', 'build.gradle'],
  dotnet: ['*.csproj', '*.sln'],
  git: ['.git'],
  docker: ['Dockerfile', 'docker-compose.yml']
};

/**
 * Context Manager
 */
export class ContextManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.files = new Map();
    this.urls = new Map();
    this.watchers = new Map();
    this.maxFileSize = options.maxFileSize || 100 * 1024; // 100KB
    this.maxTotalSize = options.maxTotalSize || 500 * 1024; // 500KB
    this.currentSize = 0;
  }

  /**
   * Add file to context
   */
  addFile(filePath, options = {}) {
    const resolved = resolve(filePath);

    if (!existsSync(resolved)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stat = statSync(resolved);

    if (!stat.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }

    if (stat.size > this.maxFileSize) {
      throw new Error(`File too large: ${filePath} (${Math.round(stat.size / 1024)}KB > ${Math.round(this.maxFileSize / 1024)}KB)`);
    }

    if (this.currentSize + stat.size > this.maxTotalSize) {
      throw new Error(`Total context size exceeded. Clear some files first.`);
    }

    const content = readFileSync(resolved, 'utf-8');
    const ext = extname(resolved);
    const language = LANGUAGE_MAP[ext] || 'text';

    const fileInfo = {
      path: resolved,
      name: basename(resolved),
      content,
      language,
      size: stat.size,
      addedAt: Date.now(),
      modified: stat.mtime.getTime()
    };

    this.files.set(resolved, fileInfo);
    this.currentSize += stat.size;

    // Set up watcher if requested
    if (options.watch) {
      this.watchFile(resolved);
    }

    eventBus.emit(EVENT_TYPES.CONTEXT_ADD, { type: 'file', path: resolved });
    this.emit('fileAdded', fileInfo);

    return fileInfo;
  }

  /**
   * Add URL content to context
   */
  async addUrl(url, options = {}) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ClaudeHydra/3.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let content;

      if (contentType.includes('application/json')) {
        const json = await response.json();
        content = JSON.stringify(json, null, 2);
      } else {
        content = await response.text();
      }

      if (content.length > this.maxFileSize) {
        content = content.slice(0, this.maxFileSize);
      }

      const urlInfo = {
        url,
        content,
        contentType,
        size: content.length,
        fetchedAt: Date.now()
      };

      this.urls.set(url, urlInfo);
      this.currentSize += content.length;

      eventBus.emit(EVENT_TYPES.CONTEXT_ADD, { type: 'url', url });
      this.emit('urlAdded', urlInfo);

      return urlInfo;
    } catch (error) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }

  /**
   * Watch file for changes
   */
  watchFile(filePath) {
    if (this.watchers.has(filePath)) {
      return;
    }

    const watcher = watch(filePath, (eventType) => {
      if (eventType === 'change') {
        this.refreshFile(filePath);
      }
    });

    this.watchers.set(filePath, watcher);
    this.emit('watchStarted', filePath);
  }

  /**
   * Stop watching file
   */
  unwatchFile(filePath) {
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
      this.emit('watchStopped', filePath);
    }
  }

  /**
   * Refresh file content
   */
  refreshFile(filePath) {
    const resolved = resolve(filePath);
    const existing = this.files.get(resolved);

    if (!existing) return null;

    this.currentSize -= existing.size;

    try {
      const content = readFileSync(resolved, 'utf-8');
      const stat = statSync(resolved);

      existing.content = content;
      existing.size = stat.size;
      existing.modified = stat.mtime.getTime();

      this.currentSize += stat.size;
      this.emit('fileRefreshed', existing);

      return existing;
    } catch (error) {
      this.emit('fileError', resolved, error);
      return null;
    }
  }

  /**
   * Remove file from context
   */
  removeFile(filePath) {
    const resolved = resolve(filePath);
    const file = this.files.get(resolved);

    if (!file) return false;

    this.currentSize -= file.size;
    this.files.delete(resolved);
    this.unwatchFile(resolved);

    eventBus.emit(EVENT_TYPES.CONTEXT_REMOVE, { type: 'file', path: resolved });
    this.emit('fileRemoved', resolved);

    return true;
  }

  /**
   * Remove URL from context
   */
  removeUrl(url) {
    const urlInfo = this.urls.get(url);

    if (!urlInfo) return false;

    this.currentSize -= urlInfo.size;
    this.urls.delete(url);

    eventBus.emit(EVENT_TYPES.CONTEXT_REMOVE, { type: 'url', url });
    this.emit('urlRemoved', url);

    return true;
  }

  /**
   * Clear all context
   */
  clear() {
    // Stop all watchers
    for (const [path, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();

    this.files.clear();
    this.urls.clear();
    this.currentSize = 0;

    eventBus.emit(EVENT_TYPES.CONTEXT_CLEAR);
    this.emit('cleared');
  }

  /**
   * Get all context as formatted string
   */
  getContextString() {
    const parts = [];

    // Files
    for (const [path, file] of this.files) {
      parts.push(`--- FILE: ${file.name} (${file.language}) ---`);
      parts.push(file.content);
      parts.push('');
    }

    // URLs
    for (const [url, urlInfo] of this.urls) {
      parts.push(`--- URL: ${url} ---`);
      parts.push(urlInfo.content);
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Get context summary
   */
  getSummary() {
    return {
      files: Array.from(this.files.values()).map(f => ({
        name: f.name,
        path: f.path,
        language: f.language,
        size: f.size
      })),
      urls: Array.from(this.urls.values()).map(u => ({
        url: u.url,
        contentType: u.contentType,
        size: u.size
      })),
      totalSize: this.currentSize,
      maxSize: this.maxTotalSize
    };
  }

  /**
   * List files
   */
  listFiles() {
    return Array.from(this.files.values());
  }

  /**
   * List URLs
   */
  listUrls() {
    return Array.from(this.urls.values());
  }

  /**
   * Detect project type
   */
  detectProjectType(directory = '.') {
    const detected = [];

    for (const [type, patterns] of Object.entries(PROJECT_PATTERNS)) {
      for (const pattern of patterns) {
        const checkPath = resolve(directory, pattern.replace('*', ''));
        if (existsSync(checkPath)) {
          detected.push(type);
          break;
        }
      }
    }

    return detected;
  }

  /**
   * Get file count
   */
  get fileCount() {
    return this.files.size;
  }

  /**
   * Get URL count
   */
  get urlCount() {
    return this.urls.size;
  }

  /**
   * Get total size
   */
  get totalSize() {
    return this.currentSize;
  }

  /**
   * Check if context is empty
   */
  get isEmpty() {
    return this.files.size === 0 && this.urls.size === 0;
  }
}

export function createContextManager(options) {
  return new ContextManager(options);
}

export default ContextManager;
