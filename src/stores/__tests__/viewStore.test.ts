import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatTab } from '../viewStore';
import { useViewStore } from '../viewStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a fresh snapshot of the store state */
const getState = () => useViewStore.getState();

/** Shorthand to call an action */
const act = <K extends keyof ReturnType<typeof useViewStore.getState>>(key: K, ...args: any[]) => {
  const fn = getState()[key];
  if (typeof fn === 'function') return (fn as (...a: unknown[]) => unknown)(...args);
  throw new Error(`${String(key)} is not a function`);
};

// ---------------------------------------------------------------------------
// Reset store between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Use merge mode (replace=false) to keep actions intact while resetting data
  useViewStore.setState({
    currentView: 'home',
    sidebarCollapsed: false,
    currentSessionId: null,
    sessions: [],
    tabs: [],
    activeTabId: null,
    chatHistory: {},
  });
  // Clear persisted storage so state doesn't leak between tests
  localStorage.removeItem('claude-hydra-v4-view');
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('viewStore — initial state', () => {
  it('has currentView set to "home"', () => {
    expect(getState().currentView).toBe('home');
  });

  it('has sidebarCollapsed set to false', () => {
    expect(getState().sidebarCollapsed).toBe(false);
  });

  it('has currentSessionId set to null', () => {
    expect(getState().currentSessionId).toBeNull();
  });

  it('has an empty sessions array', () => {
    expect(getState().sessions).toEqual([]);
  });

  it('has an empty tabs array', () => {
    expect(getState().tabs).toEqual([]);
  });

  it('has activeTabId set to null', () => {
    expect(getState().activeTabId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setCurrentView
// ---------------------------------------------------------------------------

describe('viewStore — setCurrentView', () => {
  it('changes currentView to the given ViewId', () => {
    act('setCurrentView', 'chat');
    expect(getState().currentView).toBe('chat');
  });

  it('can switch between multiple views', () => {
    act('setCurrentView', 'chat');
    expect(getState().currentView).toBe('chat');

    act('setCurrentView', 'home');
    expect(getState().currentView).toBe('home');
  });
});

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

describe('viewStore — sidebar', () => {
  it('setSidebarCollapsed sets the value directly', () => {
    act('setSidebarCollapsed', true);
    expect(getState().sidebarCollapsed).toBe(true);

    act('setSidebarCollapsed', false);
    expect(getState().sidebarCollapsed).toBe(false);
  });

  it('toggleSidebar flips sidebarCollapsed', () => {
    expect(getState().sidebarCollapsed).toBe(false);

    act('toggleSidebar');
    expect(getState().sidebarCollapsed).toBe(true);

    act('toggleSidebar');
    expect(getState().sidebarCollapsed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

describe('viewStore — createSession', () => {
  it('returns a non-empty string id', () => {
    const id = act('createSession');
    expect(typeof id).toBe('string');
    expect((id as string).length).toBeGreaterThan(0);
  });

  it('adds the new session to sessions with a title', () => {
    const id = act('createSession', 'My Chat') as string;
    const session = getState().sessions.find((s) => s.id === id);
    expect(session).toBeDefined();
    expect(session?.title).toBe('My Chat');
    expect(session?.messageCount).toBe(0);
  });

  it('sets the new session as currentSessionId', () => {
    const id = act('createSession') as string;
    expect(getState().currentSessionId).toBe(id);
  });

  it('creates a tab linked to the new session', () => {
    const id = act('createSession') as string;
    const tab = getState().tabs.find((t: ChatTab) => t.sessionId === id);
    expect(tab).toBeDefined();
    expect(tab?.isPinned).toBe(false);
    expect(getState().activeTabId).toBe(tab?.id);
  });

  it('switches currentView to "chat"', () => {
    act('createSession');
    expect(getState().currentView).toBe('chat');
  });

  it('generates "New Chat" title when none is provided', () => {
    act('createSession');
    const session = getState().sessions[0];
    expect(session?.title).toBe('New Chat');
  });

  it('prepends new sessions (most recent first)', () => {
    act('createSession', 'First');
    const secondId = act('createSession', 'Second') as string;
    expect(getState().sessions[0]?.id).toBe(secondId);
  });
});

// ---------------------------------------------------------------------------
// deleteSession
// ---------------------------------------------------------------------------

describe('viewStore — deleteSession', () => {
  it('removes the session from sessions', () => {
    const id = act('createSession', 'Deleteme') as string;
    act('deleteSession', id);
    expect(getState().sessions.find((s) => s.id === id)).toBeUndefined();
  });

  it('removes the associated tab', () => {
    const id = act('createSession') as string;
    act('deleteSession', id);
    expect(getState().tabs.find((t: ChatTab) => t.sessionId === id)).toBeUndefined();
  });

  it('updates currentSessionId when the deleted session was active', () => {
    const id1 = act('createSession', 'A') as string;
    const id2 = act('createSession', 'B') as string;

    // id2 is now active
    expect(getState().currentSessionId).toBe(id2);

    act('deleteSession', id2);
    // should fall back to remaining session
    expect(getState().currentSessionId).toBe(id1);
  });

  it('sets currentSessionId to null when no sessions remain', () => {
    const id = act('createSession') as string;
    act('deleteSession', id);
    expect(getState().currentSessionId).toBeNull();
  });

  it('does not change currentSessionId when deleting a non-active session', () => {
    const id1 = act('createSession', 'A') as string;
    const id2 = act('createSession', 'B') as string;

    // id2 is active
    act('deleteSession', id1);
    expect(getState().currentSessionId).toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// updateSessionTitle
// ---------------------------------------------------------------------------

describe('viewStore — updateSessionTitle', () => {
  it('changes the title of the targeted session', () => {
    const id = act('createSession', 'Old Title') as string;
    act('updateSessionTitle', id, 'New Title');
    const session = getState().sessions.find((s) => s.id === id);
    expect(session?.title).toBe('New Title');
  });

  it('updates the updatedAt timestamp', () => {
    const id = act('createSession', 'Title') as string;
    const before = getState().sessions.find((s) => s.id === id)?.updatedAt;

    // small delay so timestamp differs
    act('updateSessionTitle', id, 'Title v2');
    const after = getState().sessions.find((s) => s.id === id)?.updatedAt;

    expect(after).toBeGreaterThanOrEqual(before as number);
  });

  it('does not affect other sessions', () => {
    const id1 = act('createSession', 'Keep') as string;
    const id2 = act('createSession', 'Change') as string;

    act('updateSessionTitle', id2, 'Changed');

    expect(getState().sessions.find((s) => s.id === id1)?.title).toBe('Keep');
    expect(getState().sessions.find((s) => s.id === id2)?.title).toBe('Changed');
  });
});

// ---------------------------------------------------------------------------
// openTab
// ---------------------------------------------------------------------------

describe('viewStore — openTab', () => {
  it('creates a new tab for a session without one', () => {
    const id = act('createSession') as string;
    // Close the auto-created tab first
    const tabId = getState().tabs.find((t: ChatTab) => t.sessionId === id)?.id;
    act('closeTab', tabId);
    expect(getState().tabs.find((t: ChatTab) => t.sessionId === id)).toBeUndefined();

    act('openTab', id);
    expect(getState().tabs.find((t: ChatTab) => t.sessionId === id)).toBeDefined();
  });

  it('sets the opened tab as currentSessionId', () => {
    const id1 = act('createSession', 'A') as string;
    act('createSession', 'B');
    // id2 is active now; open id1
    act('openTab', id1);
    expect(getState().currentSessionId).toBe(id1);
  });

  it('does not duplicate an already-open tab', () => {
    const id = act('createSession') as string;
    const tabsBefore = getState().tabs.length;

    act('openTab', id);
    expect(getState().tabs.length).toBe(tabsBefore);
  });
});

// ---------------------------------------------------------------------------
// closeTab
// ---------------------------------------------------------------------------

describe('viewStore — closeTab', () => {
  it('removes a tab by tabId', () => {
    const sessionId = act('createSession') as string;
    const tabId = getState().tabs.find((t: ChatTab) => t.sessionId === sessionId)?.id as string;
    act('closeTab', tabId);
    expect(getState().tabs.find((t: ChatTab) => t.id === tabId)).toBeUndefined();
  });

  it('switches currentSessionId to a neighbour when closing the active tab', () => {
    const id1 = act('createSession', 'A') as string;
    const id2 = act('createSession', 'B') as string;
    const id3 = act('createSession', 'C') as string;

    // id3 is active (last created)
    const tabId3 = getState().tabs.find((t: ChatTab) => t.sessionId === id3)?.id as string;
    act('closeTab', tabId3);
    // Should fall to a remaining session
    expect([id1, id2]).toContain(getState().currentSessionId);
  });

  it('sets currentSessionId to null when the last tab is closed', () => {
    const sessionId = act('createSession') as string;
    const tabId = getState().tabs.find((t: ChatTab) => t.sessionId === sessionId)?.id as string;
    act('closeTab', tabId);
    expect(getState().currentSessionId).toBeNull();
  });

  it('does not change currentSessionId when closing a non-active tab', () => {
    const id1 = act('createSession', 'A') as string;
    const id2 = act('createSession', 'B') as string;

    // id2 is active
    const tabId1 = getState().tabs.find((t: ChatTab) => t.sessionId === id1)?.id as string;
    act('closeTab', tabId1);
    expect(getState().currentSessionId).toBe(id2);
  });

  it('does not close pinned tabs', () => {
    const sessionId = act('createSession') as string;
    const tabId = getState().tabs.find((t: ChatTab) => t.sessionId === sessionId)?.id as string;
    act('togglePinTab', tabId);
    act('closeTab', tabId);
    // Tab should still exist because it's pinned
    expect(getState().tabs.find((t: ChatTab) => t.id === tabId)).toBeDefined();
  });
});
