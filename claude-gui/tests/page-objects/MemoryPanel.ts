/**
 * MemoryPanel — page object for the Agent Memory panel.
 *
 * Wraps memory-specific interactions: agent filtering, search,
 * knowledge graph, memory entries, and CRUD operations.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { SELECTORS, TIMEOUTS, AGENT_NAMES } from '../fixtures/test-data';
import { createMockMemories, createMockKnowledgeGraph, setMockInvokeResult } from '../fixtures/tauri-mocks';

export class MemoryPanel extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  /**
   * Ensure the memory panel is visible.
   * Memory is typically embedded in a view rather than being a separate nav item.
   */
  async waitForPanel(timeout = TIMEOUTS.medium): Promise<void> {
    await this.page.locator(SELECTORS.memory.heading).waitFor({
      state: 'visible',
      timeout,
    });
  }

  /**
   * Assert the panel heading "Agent Memory" is visible.
   */
  async assertHeadingVisible(): Promise<void> {
    await expect(this.page.locator(SELECTORS.memory.heading)).toBeVisible();
  }

  // ── Agent Filter ────────────────────────────────────────────────────────────

  /**
   * Select an agent from the dropdown filter.
   */
  async filterByAgent(agentName: string): Promise<void> {
    await this.page.locator(SELECTORS.memory.agentSelect).first().selectOption({ label: agentName });
    await this.page.waitForTimeout(200);
  }

  /**
   * Get the currently selected agent.
   */
  async getSelectedAgent(): Promise<string> {
    const select = this.page.locator(SELECTORS.memory.agentSelect).first();
    return select.evaluate((el: HTMLSelectElement) => {
      return el.options[el.selectedIndex]?.text ?? '';
    });
  }

  /**
   * Get all available agents from the dropdown.
   */
  async getAvailableAgents(): Promise<string[]> {
    const select = this.page.locator(SELECTORS.memory.agentSelect).first();
    return select.evaluate((el: HTMLSelectElement) => {
      return Array.from(el.options).map((o) => o.text);
    });
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  /**
   * Type a search query into the memory search input.
   */
  async searchMemory(query: string): Promise<void> {
    await this.page.locator(SELECTORS.memory.searchInput).first().fill(query);
    await this.page.waitForTimeout(300); // debounce
  }

  /**
   * Clear the search input.
   */
  async clearSearch(): Promise<void> {
    await this.page.locator(SELECTORS.memory.searchInput).first().fill('');
    await this.page.waitForTimeout(200);
  }

  /**
   * Get the current search query value.
   */
  async getSearchValue(): Promise<string> {
    return this.page.locator(SELECTORS.memory.searchInput).first().inputValue();
  }

  // ── Memory Entries ──────────────────────────────────────────────────────────

  /**
   * Get all memory entry texts.
   */
  async getMemoryEntries(): Promise<string[]> {
    return this.page.locator(SELECTORS.memory.memoryEntry).allInnerTexts();
  }

  /**
   * Get the count of visible memory entries.
   */
  async getMemoryCount(): Promise<number> {
    return this.page.locator(SELECTORS.memory.memoryEntry).count();
  }

  /**
   * Assert the empty state ("No memories found") is visible.
   */
  async assertEmptyState(): Promise<void> {
    await expect(this.page.locator(SELECTORS.memory.emptyState)).toBeVisible();
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  /**
   * Click the Refresh button to reload memories.
   */
  async refresh(): Promise<void> {
    await this.page.locator(SELECTORS.memory.refreshBtn).click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Click the Clear memories button.
   */
  async clearMemories(): Promise<void> {
    await this.page.locator(SELECTORS.memory.clearBtn).click();
    await this.page.waitForTimeout(200);
  }

  // ── Knowledge Graph ─────────────────────────────────────────────────────────

  /**
   * Check if the Knowledge Graph section is visible.
   */
  async isKnowledgeGraphVisible(): Promise<boolean> {
    return this.page.locator(SELECTORS.memory.knowledgeGraphHeading).isVisible();
  }

  // ── Mock Data Setup ─────────────────────────────────────────────────────────

  /**
   * Inject mock memories for a given agent at runtime.
   */
  async injectMockMemories(agent: string, count = 3): Promise<void> {
    const memories = createMockMemories(agent, count);
    await setMockInvokeResult(this.page, 'get_agent_memories', memories);
    await this.refresh();
  }

  /**
   * Inject mock knowledge graph data at runtime.
   */
  async injectMockKnowledgeGraph(): Promise<void> {
    const graph = createMockKnowledgeGraph();
    await setMockInvokeResult(this.page, 'get_knowledge_graph', graph);
    await this.refresh();
  }
}
