/**
 * Session Manager - Save and restore conversations
 * @module cli-unified/session/SessionManager
 */

import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DATA_DIR } from '../core/constants.js';

/**
 * Conversation message
 * @typedef {Object} Message
 * @property {'user'|'assistant'|'system'} role
 * @property {string} content
 * @property {number} timestamp
 * @property {string} [agent] - Agent name if used
 * @property {number} [tokens] - Estimated tokens
 */

/**
 * Session data
 * @typedef {Object} Session
 * @property {string} id
 * @property {string} name
 * @property {number} created
 * @property {number} modified
 * @property {Message[]} messages
 * @property {Object} metadata
 */

/**
 * Session Manager
 */
export class SessionManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.basePath = options.basePath || join(homedir(), DATA_DIR, 'sessions');
    this.autoSave = options.autoSave ?? true;
    this.autoSaveInterval = options.autoSaveInterval || 30000;
    this.maxSessions = options.maxSessions || 100;

    // Current session
    this.currentSession = null;
    this._autoSaveTimer = null;

    // Ensure directory exists
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  /**
   * Create new session
   */
  create(name = null) {
    const id = this._generateId();
    const now = Date.now();

    this.currentSession = {
      id,
      name: name || `Session ${new Date(now).toLocaleString()}`,
      created: now,
      modified: now,
      messages: [],
      metadata: {
        mode: 'swarm',
        model: null,
        totalTokens: 0,
      },
    };

    if (this.autoSave) {
      this._startAutoSave();
    }

    this.emit('created', this.currentSession);
    return this.currentSession;
  }

  /**
   * Add message to current session
   */
  addMessage(role, content, options = {}) {
    if (!this.currentSession) {
      this.create();
    }

    const message = {
      role,
      content,
      timestamp: Date.now(),
      ...options,
    };

    // Estimate tokens
    if (!message.tokens) {
      message.tokens = Math.ceil(content.length / 4);
    }

    this.currentSession.messages.push(message);
    this.currentSession.modified = Date.now();
    this.currentSession.metadata.totalTokens += message.tokens;

    this.emit('message', message);
    return message;
  }

  /**
   * Save current session
   */
  save() {
    if (!this.currentSession) return false;

    const filePath = join(this.basePath, `${this.currentSession.id}.json`);
    writeFileSync(filePath, JSON.stringify(this.currentSession, null, 2), 'utf-8');

    this.emit('saved', this.currentSession);
    return true;
  }

  /**
   * Load session by ID
   */
  load(sessionId) {
    const filePath = join(this.basePath, `${sessionId}.json`);

    if (!existsSync(filePath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const data = readFileSync(filePath, 'utf-8');
    this.currentSession = JSON.parse(data);

    if (this.autoSave) {
      this._startAutoSave();
    }

    this.emit('loaded', this.currentSession);
    return this.currentSession;
  }

  /**
   * Load most recent session
   */
  loadRecent() {
    const sessions = this.list();
    if (sessions.length === 0) {
      return null;
    }

    // Sort by modified date
    sessions.sort((a, b) => b.modified - a.modified);
    return this.load(sessions[0].id);
  }

  /**
   * List all sessions
   */
  list() {
    const files = readdirSync(this.basePath).filter((f) => f.endsWith('.json'));

    return files
      .map((file) => {
        try {
          const data = readFileSync(join(this.basePath, file), 'utf-8');
          const session = JSON.parse(data);
          return {
            id: session.id,
            name: session.name,
            created: session.created,
            modified: session.modified,
            messageCount: session.messages?.length || 0,
            tokens: session.metadata?.totalTokens || 0,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  /**
   * Delete session
   */
  delete(sessionId) {
    const filePath = join(this.basePath, `${sessionId}.json`);

    if (existsSync(filePath)) {
      unlinkSync(filePath);

      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
        this._stopAutoSave();
      }

      this.emit('deleted', sessionId);
      return true;
    }

    return false;
  }

  /**
   * Rename current session
   */
  rename(newName) {
    if (!this.currentSession) return false;

    this.currentSession.name = newName;
    this.currentSession.modified = Date.now();
    this.save();

    this.emit('renamed', this.currentSession);
    return true;
  }

  /**
   * Get current session
   */
  getCurrent() {
    return this.currentSession;
  }

  /**
   * Get messages from current session
   */
  getMessages(limit = null) {
    if (!this.currentSession) return [];

    const messages = this.currentSession.messages;
    return limit ? messages.slice(-limit) : messages;
  }

  /**
   * Get conversation history as string
   */
  getHistoryString(limit = 10) {
    const messages = this.getMessages(limit);

    return messages
      .map((m) => {
        const role = m.role === 'user' ? 'User' : m.agent || 'Assistant';
        return `${role}: ${m.content}`;
      })
      .join('\n\n');
  }

  /**
   * Export session to different formats
   */
  export(format = 'json', sessionId = null) {
    const session = sessionId ? this._loadRaw(sessionId) : this.currentSession;
    if (!session) throw new Error('No session to export');

    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(session, null, 2);

      case 'md':
      case 'markdown':
        return this._exportMarkdown(session);

      case 'html':
        return this._exportHtml(session);

      case 'txt':
      case 'text':
        return this._exportText(session);

      default:
        throw new Error(`Unknown export format: ${format}`);
    }
  }

  _exportMarkdown(session) {
    const lines = [
      `# ${session.name}`,
      '',
      `*Created: ${new Date(session.created).toLocaleString()}*`,
      `*Messages: ${session.messages.length}*`,
      '',
      '---',
      '',
    ];

    for (const msg of session.messages) {
      const role = msg.role === 'user' ? '**User**' : `**${msg.agent || 'Assistant'}**`;
      const time = new Date(msg.timestamp).toLocaleTimeString();

      lines.push(`### ${role} (${time})`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  _exportHtml(session) {
    const messages = session.messages
      .map((msg) => {
        const role = msg.role === 'user' ? 'User' : msg.agent || 'Assistant';
        const roleClass = msg.role === 'user' ? 'user' : 'assistant';
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const content = msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');

        return `
        <div class="message ${roleClass}">
          <div class="header">
            <span class="role">${role}</span>
            <span class="time">${time}</span>
          </div>
          <div class="content">${content}</div>
        </div>
      `;
      })
      .join('\n');

    return `
<!DOCTYPE html>
<html>
<head>
  <title>${session.name}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #1a1a1a; color: #e0e0e0; }
    h1 { color: #00ff41; }
    .message { margin: 20px 0; padding: 15px; border-radius: 8px; }
    .user { background: #2a2a2a; border-left: 3px solid #00ff41; }
    .assistant { background: #252525; border-left: 3px solid #9400d3; }
    .header { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .role { font-weight: bold; color: #00ff41; }
    .time { color: #666; font-size: 0.9em; }
    .content { white-space: pre-wrap; line-height: 1.5; }
    .meta { color: #666; font-size: 0.9em; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h1>${session.name}</h1>
  <div class="meta">
    Created: ${new Date(session.created).toLocaleString()} |
    Messages: ${session.messages.length} |
    Tokens: ${session.metadata?.totalTokens || 0}
  </div>
  <div class="messages">
    ${messages}
  </div>
</body>
</html>
    `.trim();
  }

  _exportText(session) {
    const lines = [
      session.name,
      '='.repeat(session.name.length),
      '',
      `Created: ${new Date(session.created).toLocaleString()}`,
      `Messages: ${session.messages.length}`,
      '',
      '-'.repeat(40),
      '',
    ];

    for (const msg of session.messages) {
      const role = msg.role === 'user' ? 'User' : msg.agent || 'Assistant';
      lines.push(`[${role}]`);
      lines.push(msg.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  _loadRaw(sessionId) {
    const filePath = join(this.basePath, `${sessionId}.json`);
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }

  _generateId() {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  _startAutoSave() {
    this._stopAutoSave();
    this._autoSaveTimer = setInterval(() => {
      if (this.currentSession) {
        this.save();
      }
    }, this.autoSaveInterval);
  }

  _stopAutoSave() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }

  /**
   * Close and save current session
   */
  close() {
    if (this.currentSession) {
      this.save();
      this._stopAutoSave();
      this.emit('closed', this.currentSession);
      this.currentSession = null;
    }
  }

  /**
   * Cleanup old sessions (keep most recent)
   */
  cleanup(keepCount = null) {
    const keep = keepCount || this.maxSessions;
    const sessions = this.list();

    if (sessions.length <= keep) return 0;

    sessions.sort((a, b) => b.modified - a.modified);
    const toDelete = sessions.slice(keep);

    let deleted = 0;
    for (const session of toDelete) {
      if (this.delete(session.id)) deleted++;
    }

    return deleted;
  }
}

export function createSessionManager(options) {
  return new SessionManager(options);
}

export default SessionManager;
