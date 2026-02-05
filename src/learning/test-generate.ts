#!/usr/bin/env node
/**
 * Test full generation with LlamaCpp bridge
 */

import { getLlamaCppBridge } from '../hydra/providers/llamacpp-bridge.js';

async function test() {
  console.log('\n=== Testing LlamaCpp with Learning System ===\n');

  const bridge = getLlamaCppBridge();

  // Check health
  console.log('Checking system health...');
  const info = await bridge.info();
  console.log(`LlamaCpp: ${info.success ? 'OK' : 'OFFLINE'}`);
  console.log(`Models: ${info.availableModels?.join(', ') || 'main, draft, vision'}`);
  console.log();

  if (!info.success) {
    console.log('LlamaCpp MCP server is offline. Check your MCP configuration.');
    process.exit(1);
  }

  // Generate with RAG context
  console.log('Generating code with LlamaCpp...\n');
  console.log('Query: "Write a simple React hook for theme toggle"');
  console.log('-'.repeat(50));

  const startTime = Date.now();
  const result = await bridge.code('generate', {
    description: 'Write a simple React hook for theme toggle',
    language: 'javascript'
  });

  const duration = Date.now() - startTime;

  console.log('\nResponse:');
  console.log(result.content);
  console.log('-'.repeat(50));
  console.log(`\nStats:`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Duration: ${duration}ms`);
  console.log(`  Tool: llama_code`);
}

test().catch(console.error);
