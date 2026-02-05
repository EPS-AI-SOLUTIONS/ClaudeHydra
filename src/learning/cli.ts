#!/usr/bin/env node
/**
 * @fileoverview Learning System CLI
 * Command-line interface for managing the Hybrid AI Learning System
 *
 * @description
 * Usage:
 *   node src/learning/cli.js status       - Show system status
 *   node src/learning/cli.js export       - Export training data
 *   node src/learning/cli.js colab        - Generate Colab notebook
 *   node src/learning/cli.js rag-stats    - Show RAG statistics
 *   node src/learning/cli.js pull-embed   - Pull embedding model
 *
 * @module learning/cli
 */

import learning from './index.js';
import { spawn } from 'node:child_process';

const COMMANDS = {
  status: showStatus,
  export: exportTraining,
  colab: generateColab,
  'rag-stats': ragStats,
  'pull-embed': pullEmbedding,
  help: showHelp
};

async function showStatus() {
  console.log('\n=== Hybrid AI Learning System Status ===\n');

  await learning.initialize();
  const status = await learning.getStatus();

  console.log('Configuration:');
  console.log(`  RAG enabled: ${status.config.enableRAG}`);
  console.log(`  Training collection: ${status.config.collectTraining}`);
  console.log(`  Auto-save RAG: ${status.config.autoSaveRAG}`);

  console.log('\nRAG Engine:');
  console.log(`  Documents: ${status.rag.documents}`);
  console.log(`  Memory: ${status.rag.memoryMB} MB`);
  console.log(`  Embedding model: ${status.rag.model}`);
  console.log(`  Model available: ${status.rag.embeddingModelAvailable ? 'Yes' : 'No (run: ollama pull mxbai-embed-large)'}`);

  console.log('\nTraining Data:');
  console.log(`  Instructions: ${status.training.instruction.examples} examples (${status.training.instruction.size})`);
  console.log(`  Conversations: ${status.training.conversation.examples} examples (${status.training.conversation.size})`);
  console.log(`  Preferences: ${status.training.preference.examples} examples (${status.training.preference.size})`);

  console.log('\nUser Preferences:');
  console.log(`  Language: ${status.preferences.language}`);
  console.log(`  Frameworks: ${status.preferences.frameworks.join(', ')}`);
  console.log(`  Persona: ${status.preferences.persona}`);

  await learning.shutdown();
}

async function exportTraining() {
  console.log('\n=== Exporting Training Data ===\n');

  await learning.initialize();

  const result = await learning.prepareFineTuning({
    baseModel: 'llama3.2:3b',
    format: 'alpaca'
  });

  console.log('Export completed:');
  console.log(`  Train set: ${result.trainPath} (${result.trainCount} examples)`);
  console.log(`  Eval set: ${result.evalPath} (${result.evalCount} examples)`);
  console.log(`  Colab notebook: ${result.notebookPath}`);
  console.log(`  Modelfile: ${result.modelfilePath}`);

  console.log('\nNext steps:');
  console.log('1. Upload train/eval files to Google Colab');
  console.log('2. Open the generated notebook');
  console.log('3. Run all cells to fine-tune');
  console.log('4. Download GGUF and create Ollama model');

  await learning.shutdown();
}

async function generateColab() {
  console.log('\n=== Generating Colab Notebook ===\n');

  const notebookPath = await learning.fineTuneExport.generateColabNotebook({
    baseModel: 'unsloth/llama-3.2-3b-bnb-4bit',
    loraRank: 16,
    epochs: 3
  });

  console.log(`Notebook generated: ${notebookPath}`);
  console.log('\nUpload this notebook to Google Colab and run with GPU runtime.');
}

async function ragStats() {
  console.log('\n=== RAG Engine Statistics ===\n');

  await learning.initialize();
  const stats = learning.ragEngine.getStats();
  const modelCheck = await learning.ragEngine.checkEmbeddingModel();

  console.log(`Documents in store: ${stats.documents}`);
  console.log(`Memory usage: ${stats.memoryMB} MB`);
  console.log(`Embedding model: ${stats.model}`);
  console.log(`Model installed: ${modelCheck.available ? 'Yes' : 'No'}`);

  if (modelCheck.installedModels?.length > 0) {
    console.log(`Installed embedding models: ${modelCheck.installedModels.join(', ')}`);
  }

  await learning.shutdown();
}

async function pullEmbedding() {
  console.log('\n=== Pulling Embedding Model ===\n');
  console.log('Running: ollama pull mxbai-embed-large\n');

  return new Promise((resolve) => {
    const proc = spawn('ollama', ['pull', 'mxbai-embed-large'], {
      stdio: 'inherit',
      shell: true
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('\nEmbedding model installed successfully!');
      } else {
        console.log('\nFailed to install embedding model.');
        console.log('Make sure Ollama is running: ollama serve');
      }
      resolve();
    });
  });
}

function showHelp() {
  console.log(`
=== Hybrid AI Learning System CLI ===

Commands:
  status        Show system status and statistics
  export        Export training data for fine-tuning
  colab         Generate Google Colab notebook
  rag-stats     Show RAG engine statistics
  pull-embed    Pull Ollama embedding model
  help          Show this help message

Examples:
  node src/learning/cli.js status
  node src/learning/cli.js export
  node src/learning/cli.js pull-embed

For more information, see: src/learning/README.md
`);
}

// Main entry point
const command = process.argv[2] || 'help';
const handler = COMMANDS[command];

if (handler) {
  handler().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: ${command}`);
  showHelp();
  process.exit(1);
}
