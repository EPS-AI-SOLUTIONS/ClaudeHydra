/**
 * StreamSimulator - simulates streaming LLM responses for E2E tests.
 * Supports character-by-character typing, instant responses,
 * Ollama streaming, Claude session output, and Swarm protocol.
 */

import type { Page } from '@playwright/test';
import { emitStreamChunk, emitTauriEvent } from './tauri-mocks';
import { AGENTS } from './test-data';

export class StreamSimulator {
  constructor(private page: Page) {}

  /**
   * Emit a single streaming chunk.
   */
  async emitChunk(chunk: string, done: boolean, eventType = 'ollama-stream-chunk'): Promise<void> {
    await emitStreamChunk(this.page, chunk, done, eventType);
  }

  /**
   * Emit a stream error.
   */
  async emitError(error: string, eventType = 'ollama-stream-error'): Promise<void> {
    await emitTauriEvent(this.page, eventType, { error });
  }

  /**
   * Simulate character-by-character typing response.
   */
  async simulateTypingResponse(
    text: string,
    options: { delayMs?: number; chunkSize?: number; eventType?: string } = {},
  ): Promise<void> {
    const { delayMs = 30, chunkSize = 1, eventType = 'ollama-stream-chunk' } = options;

    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, i + chunkSize);
      const isDone = i + chunkSize >= text.length;
      await this.emitChunk(chunk, isDone, eventType);
      if (!isDone) {
        await this.page.waitForTimeout(delayMs);
      }
    }
  }

  /**
   * Simulate an instant full response.
   */
  async simulateInstantResponse(text: string, eventType = 'ollama-stream-chunk'): Promise<void> {
    await this.emitChunk(text, false, eventType);
    await this.page.waitForTimeout(50);
    await this.emitChunk('', true, eventType);
  }

  /**
   * Simulate Ollama streaming response with model info.
   */
  async simulateOllamaResponse(model: string, text: string): Promise<void> {
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
      const token = (i === 0 ? '' : ' ') + words[i];
      const done = i === words.length - 1;
      await emitTauriEvent(this.page, 'ollama-stream-chunk', {
        id: `chunk-${Date.now()}-${i}`,
        token,
        done,
        model,
        total_tokens: done ? words.length : undefined,
      });
      await this.page.waitForTimeout(20);
    }
  }

  /**
   * Simulate Claude session output lines.
   */
  async simulateClaudeSessionOutput(lines: string[]): Promise<void> {
    for (const line of lines) {
      await emitTauriEvent(this.page, 'claude-output', {
        content: line,
        type: 'assistant',
        timestamp: new Date().toISOString(),
      });
      await this.page.waitForTimeout(50);
    }
  }

  /**
   * Simulate a single agent response in Swarm protocol.
   */
  async simulateAgentResponse(agentName: string, content: string): Promise<void> {
    await emitTauriEvent(this.page, 'swarm-data', {
      agent: agentName,
      content: `[${agentName}] ${content}`,
      type: 'analysis',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Simulate full Swarm protocol with multiple agents.
   */
  async simulateSwarmProtocol(agents?: string[]): Promise<void> {
    const agentList = agents || AGENTS.slice(0, 5).map((a) => a.name);

    // Phase 1: Dispatch
    await emitTauriEvent(this.page, 'swarm-data', {
      type: 'dispatch',
      content: `Dispatching query to ${agentList.length} agents...`,
      agents: agentList,
      timestamp: new Date().toISOString(),
    });
    await this.page.waitForTimeout(100);

    // Phase 2: Agent responses
    for (const agent of agentList) {
      await this.simulateAgentResponse(
        agent,
        `Analysis complete. All checks passed for ${agent}'s domain.`,
      );
      await this.page.waitForTimeout(80);
    }

    // Phase 3: Synthesis
    await emitTauriEvent(this.page, 'swarm-data', {
      type: 'synthesis',
      content: `Synthesis complete. ${agentList.length} agents responded.`,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Simulate a markdown response.
   */
  async simulateMarkdownResponse(): Promise<void> {
    const markdown = [
      '# Analysis Report\n\n',
      '## Summary\n\n',
      'The project is in **good shape**. ',
      'Here are the key findings:\n\n',
      '- Code quality: *excellent*\n',
      '- Test coverage: **85%**\n',
      '- Security: no vulnerabilities found\n\n',
      '## Code Example\n\n',
      '```typescript\n',
      'const result = await analyze(project);\n',
      'console.log(result.score);\n',
      '```\n\n',
      'Overall recommendation: **proceed with deployment**.',
    ];

    for (let i = 0; i < markdown.length; i++) {
      const done = i === markdown.length - 1;
      await this.emitChunk(markdown[i], done);
      await this.page.waitForTimeout(30);
    }
  }

  /**
   * Simulate a code response.
   */
  async simulateCodeResponse(language: string, code: string): Promise<void> {
    const response = `Here's the code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nThis code is ready to use.`;
    await this.simulateInstantResponse(response);
  }

  /**
   * Simulate a timeout / connection error.
   */
  async simulateTimeout(afterMs = 5000): Promise<void> {
    await this.page.waitForTimeout(afterMs);
    await this.emitError(`Connection timed out after ${afterMs}ms`);
  }

  /**
   * Simulate partial response followed by error.
   */
  async simulatePartialThenError(partialText: string, error: string): Promise<void> {
    // Send partial
    await this.simulateTypingResponse(partialText, { delayMs: 20 });
    await this.page.waitForTimeout(200);
    // Then error
    await this.emitError(error);
  }
}

/**
 * Factory to create a StreamSimulator for a given page.
 */
export function createStreamSimulator(page: Page): StreamSimulator {
  return new StreamSimulator(page);
}
