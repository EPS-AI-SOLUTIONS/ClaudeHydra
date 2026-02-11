/**
 * Test RAG-based Continuous Learning Pipeline
 * Flow: Prompt → Avallac'h (Research + RAG) → Ollama → Vilgefortz → Alzur (RAG save)
 */

const OLLAMA_URL = 'http://localhost:11434';

// Simulated RAG store (in real app uses Tauri invoke)
const ragStore = new Map();
const _ragIdCounter = 0;

// Alzur state
let sampleCount = 0;
let buffer = [];
let modelVersion = 0;
const BATCH_SIZE = 5; // Lower for testing

// ═══════════════════════════════════════════════════════════════
// RAG Functions (simulated)
// ═══════════════════════════════════════════════════════════════
function ragAdd(id, content, metadata) {
  ragStore.set(id, { id, content, metadata, embedding: simpleEmbed(content) });
  console.log(`   📚 [RAG] Saved: ${id} (${ragStore.size} total)`);
}

function ragSearch(query, topK = 3) {
  const queryEmbed = simpleEmbed(query);
  const results = [...ragStore.values()]
    .map((doc) => ({
      ...doc,
      score: cosineSimilarity(queryEmbed, doc.embedding),
    }))
    .filter((doc) => doc.score > 0.1) // Lower threshold for simple embeddings
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return results;
}

// Simple embedding (word frequency vector)
function simpleEmbed(text) {
  const words = text.toLowerCase().split(/\s+/);
  const freq = {};
  words.forEach((w) => {
    freq[w] = (freq[w] || 0) + 1;
  });
  return freq;
}

function cosineSimilarity(a, b) {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dotProduct = 0,
    normA = 0,
    normB = 0;

  for (const key of allKeys) {
    const valA = a[key] || 0;
    const valB = b[key] || 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ═══════════════════════════════════════════════════════════════
// Pipeline Stages
// ═══════════════════════════════════════════════════════════════

async function avallachPreProcess(prompt) {
  console.log(`\n🧙 [AVALLAC'H] Processing: "${prompt.slice(0, 40)}..."`);

  const context = [];

  // Search RAG memory
  const ragResults = ragSearch(prompt, 2);
  if (ragResults.length > 0) {
    console.log(`   📚 Found ${ragResults.length} relevant memories!`);
    context.push(`[Alzur Memory]`);
    ragResults.forEach((r, i) => {
      const snippet = r.content.slice(0, 100).replace(/\n/g, ' ');
      context.push(`  ${i + 1}. ${snippet}... (${(r.score * 100).toFixed(0)}%)`);
    });
  } else {
    console.log(`   📚 No relevant memories yet`);
  }

  // Simulate web search
  context.push(`[Web] Simulated search results for "${prompt.slice(0, 20)}..."`);

  return {
    enrichedPrompt:
      context.length > 0 ? `[Context]\n${context.join('\n')}\n\n[Query]\n${prompt}` : prompt,
    context,
  };
}

async function ollamaGenerate(prompt) {
  console.log(`🤖 [OLLAMA] Generating response...`);
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2:1b',
        prompt: prompt,
        stream: false,
      }),
    });
    const data = await response.json();
    console.log(`   ✅ Response: ${data.response?.slice(0, 60)}...`);
    return data.response || 'Mock response';
  } catch {
    const mock =
      'This is a detailed mock response about the topic. It includes technical information and code examples. The response is comprehensive and educational.';
    console.log(`   ⚠️ Mock response (Ollama offline)`);
    return mock;
  }
}

function vilgefortzAnalyze(response) {
  console.log(`🔮 [VILGEFORTZ] Analyzing (${response.length} chars)`);
  const hasCode = response.includes('```');
  const quality = response.length > 200 ? 'HIGH' : 'MEDIUM';
  console.log(`   Quality: ${quality}, Has code: ${hasCode}`);
  return { quality, hasCode };
}

async function alzurLearn(prompt, response) {
  sampleCount++;

  // Save to RAG
  const sampleId = `alzur-${Date.now()}-${sampleCount}`;
  const sampleContent = `Q: ${prompt}\n\nA: ${response.slice(0, 500)}`;
  ragAdd(sampleId, sampleContent, { type: 'training_sample' });

  buffer.push({ prompt, completion: response });
  console.log(`⚗️ [ALZUR] Sample #${sampleCount} → RAG (buffer: ${buffer.length}/${BATCH_SIZE})`);

  // Create model upgrade when buffer is full
  if (buffer.length >= BATCH_SIZE) {
    modelVersion++;
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`🚀 [ALZUR] MODEL UPGRADE: alzur-v${modelVersion}`);
    console.log(`   Learned from ${buffer.length} samples`);
    console.log(`   Total RAG entries: ${ragStore.size}`);
    console.log(`${'═'.repeat(50)}\n`);
    buffer = [];
  }
}

// ═══════════════════════════════════════════════════════════════
// Full Pipeline
// ═══════════════════════════════════════════════════════════════

async function runPipeline(prompt) {
  // Stage 1: Avallac'h (Pre-process + RAG search)
  const { enrichedPrompt, context } = await avallachPreProcess(prompt);

  // Stage 2: Ollama (AI generation)
  const response = await ollamaGenerate(enrichedPrompt);

  // Stage 3: Vilgefortz (Analysis)
  vilgefortzAnalyze(response);

  // Stage 4: Alzur (Save to RAG + model upgrade)
  await alzurLearn(prompt, response);
}

// ═══════════════════════════════════════════════════════════════
// Test
// ═══════════════════════════════════════════════════════════════

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RAG-BASED CONTINUOUS LEARNING TEST');
  console.log('  Testing: RAG memory → Context enrichment → Learning');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const prompts = [
    // Round 1: Initial learning (no RAG memory yet)
    'What is TypeScript?',
    'Explain React hooks',
    'How to use async/await?',
    'What is a REST API?',
    'Explain Docker containers',

    // Round 2: Should find relevant RAG memories!
    'Tell me about TypeScript features', // Should find "What is TypeScript?"
    'How do React hooks work?', // Should find "Explain React hooks"
    'Async programming in JavaScript', // Should find "How to use async/await?"
  ];

  for (let i = 0; i < prompts.length; i++) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📝 PROMPT ${i + 1}/${prompts.length}: "${prompts[i]}"`);
    console.log(`${'─'.repeat(60)}`);

    await runPipeline(prompts[i]);

    // Small delay
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TEST COMPLETE');
  console.log(`  Total samples: ${sampleCount}`);
  console.log(`  RAG entries: ${ragStore.size}`);
  console.log(`  Model version: alzur-v${modelVersion}`);
  console.log(`  Buffer remaining: ${buffer.length}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

runTest().catch(console.error);
