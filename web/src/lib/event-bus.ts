import { EventEmitter } from 'node:events';

// Singleton EventEmitter — survives Next.js hot-reloads via globalThis
const globalForEvents = globalThis as unknown as {
  __hydraEventBus?: EventEmitter;
};

export const eventBus: EventEmitter =
  globalForEvents.__hydraEventBus ??
  (() => {
    const bus = new EventEmitter();
    bus.setMaxListeners(50);
    globalForEvents.__hydraEventBus = bus;
    return bus;
  })();

// Typed event names
export const EVENTS = {
  CLAUDE_EVENT: 'claude-event',
  APPROVAL_REQUIRED: 'approval-required',
  AUTO_APPROVED: 'auto-approved',
  SESSION_ENDED: 'session-ended',
  DEBUG_LOG: 'debug-log',
} as const;
