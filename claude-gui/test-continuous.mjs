/**
 * Test Continuous Learning Pipeline
 * Symuluje 15 promptów → powinny uruchomić się mikro-treningi
 */

const OLLAMA_URL = 'http://localhost:11434';

// Simulate pipeline stages
let trainingSampleCount = 0;
let trainingBuffer = [];
let isTraining = false;
let currentModelVersion = 0;
const MICRO_BATCH_SIZE = 10;

async function simulateAvallach(prompt) {
  console.log(`\n🧙 [AVALLAC'H] Researching: "${prompt.slice(0, 40)}..."`);
  // Simulate research delay
  await new Promise((r) => setTimeout(r, 100));
  return { context: ['[SO] Example result', '[Web] Documentation snippet'] };
}

async function simulateOllama(prompt) {
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
    return 'Mock response for testing purposes. This is a simulated AI response.';
  }
}

function simulateVilgefortz(response) {
  console.log(`🔮 [VILGEFORTZ] Analyzing (${response.length} chars)`);
  return { quality: response.length > 50 ? 'HIGH' : 'MEDIUM', insights: ['insight1'] };
}

async function simulateAlzur(prompt, response) {
  trainingSampleCount++;

  // Add to buffer
  trainingBuffer.push({ prompt, completion: response });

  console.log(
    `⚗️ [ALZUR] Sample #${trainingSampleCount} collected (buffer: ${trainingBuffer.length}/${MICRO_BATCH_SIZE})`,
  );

  // Check if micro-batch ready
  if (trainingBuffer.length >= MICRO_BATCH_SIZE && !isTraining) {
    isTraining = true;
    const batch = [...trainingBuffer];
    trainingBuffer = [];

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🚀 [ALZUR] MICRO-TRAINING STARTED!`);
    console.log(`   Batch size: ${batch.length} samples`);
    console.log(`   Model version: alzur-v${++currentModelVersion}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Simulate training time
    await new Promise((r) => setTimeout(r, 500));

    console.log(`✅ [ALZUR] Training complete! Model alzur-v${currentModelVersion} ready.`);
    isTraining = false;
  }
}

async function runFullPipeline(prompt) {
  // Stage 1: Avallac'h
  const { context } = await simulateAvallach(prompt);

  // Stage 2: Ollama
  const enrichedPrompt = `[Context: ${context.join(', ')}]\n${prompt}`;
  const response = await simulateOllama(enrichedPrompt);

  // Stage 3: Vilgefortz
  simulateVilgefortz(response);

  // Stage 4: Alzur (continuous training)
  await simulateAlzur(prompt, response);
}

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  CONTINUOUS LEARNING TEST - 15 prompts');
  console.log('  Expected: 1 micro-training after 10 samples');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const prompts = [
    'What is TypeScript?',
    'Explain React hooks',
    'How to use async/await?',
    'What is a REST API?',
    'Explain Docker containers',
    'What is GraphQL?',
    'How does Git work?',
    'Explain microservices',
    'What is CI/CD?',
    'How to write tests?', // <- Training should trigger here!
    'What is Kubernetes?',
    'Explain WebSockets',
    'What is Redis?',
    'How to optimize SQL?',
    'What is OAuth?',
  ];

  for (let i = 0; i < prompts.length; i++) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📝 PROMPT ${i + 1}/${prompts.length}: "${prompts[i]}"`);
    console.log(`${'─'.repeat(60)}`);

    await runFullPipeline(prompts[i]);

    // Small delay between prompts
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TEST COMPLETE');
  console.log(`  Total samples: ${trainingSampleCount}`);
  console.log(`  Training batches run: ${currentModelVersion}`);
  console.log(`  Buffer remaining: ${trainingBuffer.length}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

runTest().catch(console.error);
