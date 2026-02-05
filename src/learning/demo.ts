#!/usr/bin/env node
/**
 * @fileoverview Learning System Demo
 * Demonstrates the Hybrid AI Learning System in action
 */

import learning from './index.js';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(color, prefix, message) {
  console.log(`${color}${prefix}${COLORS.reset} ${message}`);
}

async function demo() {
  console.log('\n' + '='.repeat(60));
  console.log(`${COLORS.bright}${COLORS.cyan}  HYBRID AI LEARNING SYSTEM - DEMO${COLORS.reset}`);
  console.log('='.repeat(60) + '\n');

  // 1. Initialize
  log(COLORS.yellow, '[1/6]', 'Initializing learning system...');
  const initResult = await learning.initialize({
    enableRAG: true,
    collectTraining: true
  });
  console.log(`      RAG ready: ${initResult.ragReady}`);
  console.log(`      Embedding model: ${initResult.embeddingModel}`);
  console.log(`      Documents loaded: ${initResult.documentsLoaded}\n`);

  // 2. Add some documents to RAG
  log(COLORS.yellow, '[2/6]', 'Adding knowledge to RAG...');

  const documents = [
    {
      id: 'react-hooks-1',
      content: 'React hooks like useState and useEffect allow you to use state and lifecycle features in functional components. useState returns a state value and setter function.',
      metadata: { topic: 'react', type: 'knowledge' }
    },
    {
      id: 'typescript-strict-1',
      content: 'TypeScript strict mode enables stricter type checking. Use "strict": true in tsconfig.json. Avoid using "any" type - prefer "unknown" for type-safe unknown values.',
      metadata: { topic: 'typescript', type: 'knowledge' }
    },
    {
      id: 'zustand-store-1',
      content: 'Zustand is a minimal state management library. Create stores with create() function. Use selectors for performance: const count = useStore(state => state.count).',
      metadata: { topic: 'zustand', type: 'knowledge' }
    },
    {
      id: 'user-preference-1',
      content: 'User prefers functional components over class components. Coding style: strict TypeScript, no-any, prefer const over let. Uses React 19, Zustand, and Tauri.',
      metadata: { topic: 'preferences', type: 'user' }
    }
  ];

  for (const doc of documents) {
    const result = await learning.ragEngine.addDocument(doc.id, doc.content, doc.metadata);
    console.log(`      Added: ${doc.id} - ${result.success ? 'OK' : 'FAILED'}`);
  }
  console.log();

  // 3. Test RAG search
  log(COLORS.yellow, '[3/6]', 'Testing semantic search...');

  const queries = [
    'How do I manage state in React?',
    'What TypeScript settings should I use?',
    'What are the user coding preferences?'
  ];

  for (const query of queries) {
    console.log(`\n      Query: "${query}"`);
    const results = await learning.ragEngine.search(query, { topK: 2, minScore: 0.3 });

    if (results.length === 0) {
      console.log(`      ${COLORS.magenta}No results found${COLORS.reset}`);
    } else {
      for (const r of results) {
        console.log(`      ${COLORS.green}[${r.score.toFixed(2)}]${COLORS.reset} ${r.content.slice(0, 80)}...`);
      }
    }
  }
  console.log();

  // 4. Generate dynamic prompt
  log(COLORS.yellow, '[4/6]', 'Generating context-aware prompt...');

  const promptResult = await learning.generatePrompt('Write a custom React hook for dark mode', {
    task: 'code'
  });

  console.log(`      Context sources: ${promptResult.contextSources.length}`);
  console.log(`      Tokens: ~${promptResult.tokens}`);
  console.log(`\n      ${COLORS.cyan}--- System Prompt Preview ---${COLORS.reset}`);
  console.log(promptResult.systemPrompt.slice(0, 500) + '...\n');

  // 5. Collect training data
  log(COLORS.yellow, '[5/6]', 'Collecting training data...');

  const interactionResult = await learning.processInteraction(
    'Write a function to validate email addresses',
    `function validateEmail(email: string): boolean {
  const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return regex.test(email);
}`,
    { task: 'code', model: 'demo' }
  );

  console.log(`      RAG stored: ${interactionResult.ragStored}`);
  console.log(`      Training collected: ${interactionResult.trainingCollected}\n`);

  // 6. Show statistics
  log(COLORS.yellow, '[6/6]', 'System statistics...');

  const status = await learning.getStatus();

  console.log(`\n      ${COLORS.bright}RAG Engine:${COLORS.reset}`);
  console.log(`        Documents: ${status.rag.documents}`);
  console.log(`        Memory: ${status.rag.memoryMB} MB`);
  console.log(`        Model available: ${status.rag.embeddingModelAvailable}`);

  console.log(`\n      ${COLORS.bright}Training Data:${COLORS.reset}`);
  console.log(`        Instructions: ${status.training.instruction.examples} (${status.training.instruction.size})`);
  console.log(`        Conversations: ${status.training.conversation.examples} (${status.training.conversation.size})`);

  console.log(`\n      ${COLORS.bright}User Preferences:${COLORS.reset}`);
  console.log(`        Language: ${status.preferences.language}`);
  console.log(`        Frameworks: ${status.preferences.frameworks.join(', ')}`);
  console.log(`        Persona: ${status.preferences.persona}`);

  // Save and cleanup
  await learning.save();
  await learning.shutdown();

  console.log('\n' + '='.repeat(60));
  console.log(`${COLORS.bright}${COLORS.green}  DEMO COMPLETE!${COLORS.reset}`);
  console.log('='.repeat(60));

  console.log(`
${COLORS.cyan}Next steps:${COLORS.reset}
1. Use the wrapper in your code:
   ${COLORS.yellow}import ollama from './src/learning/ollama-learning-wrapper.js'${COLORS.reset}

2. Every interaction is automatically:
   - Stored in RAG for semantic retrieval
   - Collected for future fine-tuning

3. When you have 500+ examples, export for fine-tuning:
   ${COLORS.yellow}node src/learning/cli.js export${COLORS.reset}

4. Check status anytime:
   ${COLORS.yellow}node src/learning/cli.js status${COLORS.reset}
`);
}

demo().catch(err => {
  console.error('Demo error:', err);
  process.exit(1);
});
