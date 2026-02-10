/**
 * Debug: test bridge HTTP fallback directly
 */
import { getLlamaCppBridge, resetLlamaCppBridge } from './src/hydra/providers/llamacpp-bridge.ts';

async function main() {
  console.log('=== Bridge HTTP Fallback Test ===\n');

  resetLlamaCppBridge();
  const bridge = getLlamaCppBridge({ defaultModel: 'llama3.2:1b' });
  // NO mcpInvoker set → should auto-fallback to HTTP

  console.log(`Mode: ${bridge._mode}`);
  console.log(`MCP invoker: ${bridge.mcpInvoker ? 'set' : 'NOT set (will use HTTP)'}`);

  // Test 1: Health check
  console.log('\n[1] Health check (ollama_list via HTTP)...');
  const t1 = Date.now();
  try {
    const health = await bridge.healthCheck(true);
    console.log(`    ✅ ${Date.now() - t1}ms - available: ${health.available}`);
  } catch (err) {
    console.error(`    ❌ ${err.message}`);
  }

  // Test 2: Generate
  console.log('\n[2] Generate("Hello, who are you?")...');
  const t2 = Date.now();
  try {
    const result = await bridge.generate('Hello, who are you? Answer in one short sentence.', {
      maxTokens: 50,
      temperature: 0.5,
    });
    console.log(`    ✅ ${Date.now() - t2}ms`);
    console.log(`    Model: ${result.model}`);
    console.log(`    Response: ${result.content?.substring(0, 200)}`);
    console.log(`    Tokens: ${result.tokens}`);
    console.log(`    Mode: ${bridge._mode}`);
  } catch (err) {
    console.error(`    ❌ ${err.message}`);
  }

  console.log('\n=== Done ===');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
