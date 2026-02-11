/**
 * ChatPage — page object for the Ollama Chat view.
 *
 * Wraps chat-specific interactions: send messages, model selection,
 * streaming responses, markdown rendering, code blocks, and file attachments.
 */

import { expect } from '@playwright/test';
import { NAV_LABELS, SELECTORS, TIMEOUTS } from '../fixtures/test-data';
import { BasePage } from './BasePage';

export class ChatPage extends BasePage {
  // ── Navigation ──────────────────────────────────────────────────────────────

  /**
   * Navigate to Ollama Chat view via sidebar.
   */
  async navigateToChat(): Promise<void> {
    await this.page.locator(SELECTORS.sidebar.navItem, { hasText: NAV_LABELS.ollama }).click();
    await this.page.waitForTimeout(300);
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  /**
   * Send a message via the chat input and click the send button.
   */
  async sendMessage(text: string): Promise<void> {
    const input = this.page.locator(SELECTORS.chat.input).first();
    await input.fill(text);
    await this.page.locator(SELECTORS.chat.sendBtn).first().click();
  }

  /**
   * Send a message by pressing Enter.
   */
  async sendMessageWithEnter(text: string): Promise<void> {
    const input = this.page.locator(SELECTORS.chat.input).first();
    await input.fill(text);
    await input.press('Enter');
  }

  /**
   * Get the current chat input value.
   */
  async getChatInputValue(): Promise<string> {
    return this.page.locator(SELECTORS.chat.input).first().inputValue();
  }

  /**
   * Check if the chat input is visible and ready.
   */
  async isInputVisible(): Promise<boolean> {
    return this.page.locator(SELECTORS.chat.input).first().isVisible();
  }

  // ── Messages ────────────────────────────────────────────────────────────────

  /**
   * Get all user message texts.
   */
  async getUserMessages(): Promise<string[]> {
    return this.page.locator(SELECTORS.chat.messageUser).allInnerTexts();
  }

  /**
   * Get all assistant message texts.
   */
  async getAssistantMessages(): Promise<string[]> {
    return this.page.locator(SELECTORS.chat.messageAssistant).allInnerTexts();
  }

  /**
   * Get the content of the last assistant message.
   */
  async getLastAssistantMessage(): Promise<string> {
    const msgs = await this.getAssistantMessages();
    return msgs.length > 0 ? msgs[msgs.length - 1] : '';
  }

  /**
   * Get total message count (user + assistant).
   */
  async getMessageCount(): Promise<number> {
    const user = await this.page.locator(SELECTORS.chat.messageUser).count();
    const assistant = await this.page.locator(SELECTORS.chat.messageAssistant).count();
    return user + assistant;
  }

  /**
   * Assert the chat shows the empty state.
   */
  async assertEmptyState(): Promise<void> {
    await expect(this.page.locator(SELECTORS.chat.emptyState)).toBeVisible();
  }

  // ── Model Selection ─────────────────────────────────────────────────────────

  /**
   * Select a model from the dropdown.
   */
  async selectModel(modelName: string): Promise<void> {
    await this.page.locator(SELECTORS.chat.modelSelect).first().selectOption({ label: modelName });
  }

  /**
   * Get the currently selected model name.
   */
  async getSelectedModel(): Promise<string> {
    const select = this.page.locator(SELECTORS.chat.modelSelect).first();
    return select.evaluate((el: HTMLSelectElement) => {
      return el.options[el.selectedIndex]?.text ?? '';
    });
  }

  /**
   * Get all available model names from the dropdown.
   */
  async getAvailableModels(): Promise<string[]> {
    const select = this.page.locator(SELECTORS.chat.modelSelect).first();
    return select.evaluate((el: HTMLSelectElement) => {
      return Array.from(el.options).map((o) => o.text);
    });
  }

  // ── Streaming ───────────────────────────────────────────────────────────────

  /**
   * Check if the streaming indicator is visible.
   */
  async isStreaming(): Promise<boolean> {
    return this.page.locator(SELECTORS.chat.streamingIndicator).isVisible();
  }

  /**
   * Wait for streaming to complete (indicator disappears).
   */
  async waitForStreamingComplete(timeout = TIMEOUTS.streaming): Promise<void> {
    const indicator = this.page.locator(SELECTORS.chat.streamingIndicator);
    // First, wait for it to appear (if not yet visible)
    try {
      await indicator.waitFor({ state: 'visible', timeout: 2000 });
    } catch {
      // May already be done
    }
    // Then wait for it to disappear
    await indicator.waitFor({ state: 'hidden', timeout });
  }

  // ── Markdown / Code ─────────────────────────────────────────────────────────

  /**
   * Check if any code block is present in the chat.
   */
  async hasCodeBlock(): Promise<boolean> {
    return (await this.page.locator(SELECTORS.chat.codeBlock).count()) > 0;
  }

  /**
   * Get the text content of the first code block.
   */
  async getCodeBlockContent(): Promise<string> {
    return this.page.locator(SELECTORS.chat.codeBlock).first().innerText();
  }

  /**
   * Get all code block contents.
   */
  async getAllCodeBlocks(): Promise<string[]> {
    return this.page.locator(SELECTORS.chat.codeBlock).allInnerTexts();
  }

  // ── Chat Actions ────────────────────────────────────────────────────────────

  /**
   * Clear the chat history.
   */
  async clearChat(): Promise<void> {
    await this.page.locator(SELECTORS.chat.clearBtn).click();
  }

  /**
   * Check if the heading "Ollama Chat" is visible.
   */
  async isHeadingVisible(): Promise<boolean> {
    return this.page.locator(SELECTORS.chat.heading).isVisible();
  }
}
