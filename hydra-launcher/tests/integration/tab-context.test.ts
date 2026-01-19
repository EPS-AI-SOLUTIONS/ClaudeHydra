import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tab and Provider types
type CLIProvider = 'hydra' | 'gemini' | 'deepseek' | 'codex' | 'grok' | 'jules';

interface Tab {
  id: string;
  name: string;
  provider: CLIProvider;
  isActive: boolean;
  createdAt: number;
  messages: Message[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// Mock Tab Context implementation
class TabManager {
  private tabs: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;

  createTab(name: string, provider: CLIProvider): Tab {
    const id = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tab: Tab = {
      id,
      name,
      provider,
      isActive: false,
      createdAt: Date.now(),
      messages: [],
    };
    this.tabs.set(id, tab);

    // If first tab, make it active
    if (this.tabs.size === 1) {
      this.setActiveTab(id);
    }

    return tab;
  }

  getTab(id: string): Tab | undefined {
    return this.tabs.get(id);
  }

  getAllTabs(): Tab[] {
    return Array.from(this.tabs.values());
  }

  getActiveTab(): Tab | undefined {
    if (!this.activeTabId) return undefined;
    return this.tabs.get(this.activeTabId);
  }

  setActiveTab(id: string): boolean {
    if (!this.tabs.has(id)) return false;

    // Deactivate current tab
    if (this.activeTabId) {
      const currentTab = this.tabs.get(this.activeTabId);
      if (currentTab) {
        currentTab.isActive = false;
      }
    }

    // Activate new tab
    const tab = this.tabs.get(id);
    if (tab) {
      tab.isActive = true;
      this.activeTabId = id;
      return true;
    }
    return false;
  }

  closeTab(id: string): boolean {
    const tab = this.tabs.get(id);
    if (!tab) return false;

    this.tabs.delete(id);

    // If closed tab was active, activate another
    if (this.activeTabId === id) {
      const remainingTabs = this.getAllTabs();
      if (remainingTabs.length > 0) {
        this.setActiveTab(remainingTabs[0].id);
      } else {
        this.activeTabId = null;
      }
    }

    return true;
  }

  renameTab(id: string, newName: string): boolean {
    const tab = this.tabs.get(id);
    if (!tab) return false;

    tab.name = newName;
    return true;
  }

  addMessage(tabId: string, role: Message['role'], content: string): Message | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;

    const message: Message = {
      id: `msg_${Date.now()}`,
      role,
      content,
      timestamp: new Date(),
    };

    tab.messages.push(message);
    return message;
  }

  getMessages(tabId: string): Message[] {
    const tab = this.tabs.get(tabId);
    return tab?.messages || [];
  }

  clearMessages(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    tab.messages = [];
    return true;
  }
}

describe('Tab Context Integration', () => {
  let tabManager: TabManager;

  beforeEach(() => {
    tabManager = new TabManager();
  });

  describe('Tab Creation', () => {
    it('should create a new tab with unique ID', () => {
      const tab = tabManager.createTab('HYDRA #1', 'hydra');
      expect(tab.id).toMatch(/^tab_\d+_[a-z0-9]+$/);
      expect(tab.name).toBe('HYDRA #1');
      expect(tab.provider).toBe('hydra');
    });

    it('should auto-activate first created tab', () => {
      const tab = tabManager.createTab('First Tab', 'hydra');
      expect(tab.isActive).toBe(true);
      expect(tabManager.getActiveTab()?.id).toBe(tab.id);
    });

    it('should not auto-activate subsequent tabs', () => {
      const tab1 = tabManager.createTab('Tab 1', 'hydra');
      const tab2 = tabManager.createTab('Tab 2', 'gemini');

      expect(tab1.isActive).toBe(true);
      expect(tab2.isActive).toBe(false);
    });

    it('should support all CLI providers', () => {
      const providers: CLIProvider[] = ['hydra', 'gemini', 'deepseek', 'codex', 'grok', 'jules'];

      providers.forEach(provider => {
        const tab = tabManager.createTab(`${provider} Tab`, provider);
        expect(tab.provider).toBe(provider);
      });

      expect(tabManager.getAllTabs().length).toBe(6);
    });
  });

  describe('Tab Switching', () => {
    it('should switch active tab correctly', () => {
      const tab1 = tabManager.createTab('Tab 1', 'hydra');
      const tab2 = tabManager.createTab('Tab 2', 'gemini');

      tabManager.setActiveTab(tab2.id);

      expect(tabManager.getActiveTab()?.id).toBe(tab2.id);
      expect(tabManager.getTab(tab1.id)?.isActive).toBe(false);
      expect(tabManager.getTab(tab2.id)?.isActive).toBe(true);
    });

    it('should return false for non-existent tab', () => {
      const result = tabManager.setActiveTab('non_existent');
      expect(result).toBe(false);
    });
  });

  describe('Tab Closing', () => {
    it('should close a tab', () => {
      const tab = tabManager.createTab('Tab to Close', 'hydra');
      const result = tabManager.closeTab(tab.id);

      expect(result).toBe(true);
      expect(tabManager.getTab(tab.id)).toBeUndefined();
    });

    it('should activate another tab when active tab is closed', () => {
      const tab1 = tabManager.createTab('Tab 1', 'hydra');
      const tab2 = tabManager.createTab('Tab 2', 'gemini');

      tabManager.closeTab(tab1.id);

      expect(tabManager.getActiveTab()?.id).toBe(tab2.id);
    });

    it('should handle closing last tab', () => {
      const tab = tabManager.createTab('Only Tab', 'hydra');
      tabManager.closeTab(tab.id);

      expect(tabManager.getActiveTab()).toBeUndefined();
      expect(tabManager.getAllTabs().length).toBe(0);
    });
  });

  describe('Tab Renaming', () => {
    it('should rename a tab', () => {
      const tab = tabManager.createTab('Original Name', 'hydra');
      const result = tabManager.renameTab(tab.id, 'New Name');

      expect(result).toBe(true);
      expect(tabManager.getTab(tab.id)?.name).toBe('New Name');
    });

    it('should return false for non-existent tab', () => {
      const result = tabManager.renameTab('non_existent', 'New Name');
      expect(result).toBe(false);
    });
  });

  describe('Message Management', () => {
    it('should add messages to a tab', () => {
      const tab = tabManager.createTab('Chat Tab', 'hydra');

      const userMsg = tabManager.addMessage(tab.id, 'user', 'Hello HYDRA');
      const assistantMsg = tabManager.addMessage(tab.id, 'assistant', 'Hello! How can I help?');

      expect(userMsg?.role).toBe('user');
      expect(assistantMsg?.role).toBe('assistant');
      expect(tabManager.getMessages(tab.id).length).toBe(2);
    });

    it('should preserve message order', () => {
      const tab = tabManager.createTab('Chat Tab', 'hydra');

      tabManager.addMessage(tab.id, 'user', 'First');
      tabManager.addMessage(tab.id, 'assistant', 'Second');
      tabManager.addMessage(tab.id, 'user', 'Third');

      const messages = tabManager.getMessages(tab.id);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
      expect(messages[2].content).toBe('Third');
    });

    it('should clear messages', () => {
      const tab = tabManager.createTab('Chat Tab', 'hydra');
      tabManager.addMessage(tab.id, 'user', 'Message to clear');

      const result = tabManager.clearMessages(tab.id);

      expect(result).toBe(true);
      expect(tabManager.getMessages(tab.id).length).toBe(0);
    });

    it('should return empty array for non-existent tab', () => {
      const messages = tabManager.getMessages('non_existent');
      expect(messages).toEqual([]);
    });
  });

  describe('Multi-Tab Workflow', () => {
    it('should handle complex multi-tab scenario', () => {
      // Create multiple tabs with different providers
      const hydraTab = tabManager.createTab('HYDRA Session', 'hydra');
      const geminiTab = tabManager.createTab('Gemini Analysis', 'gemini');
      const deepseekTab = tabManager.createTab('DeepSeek Code', 'deepseek');

      // Add messages to each
      tabManager.addMessage(hydraTab.id, 'user', 'HYDRA query');
      tabManager.addMessage(geminiTab.id, 'user', 'Gemini query');
      tabManager.addMessage(deepseekTab.id, 'user', 'DeepSeek query');

      // Switch between tabs
      tabManager.setActiveTab(geminiTab.id);
      expect(tabManager.getActiveTab()?.provider).toBe('gemini');

      tabManager.setActiveTab(deepseekTab.id);
      expect(tabManager.getActiveTab()?.provider).toBe('deepseek');

      // Close one tab
      tabManager.closeTab(geminiTab.id);
      expect(tabManager.getAllTabs().length).toBe(2);

      // Verify messages are still intact
      expect(tabManager.getMessages(hydraTab.id).length).toBe(1);
      expect(tabManager.getMessages(deepseekTab.id).length).toBe(1);
    });
  });
});
