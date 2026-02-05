/**
 * @fileoverview Fine-tuning Export Pipeline
 * Prepares training data for Unsloth/QLoRA fine-tuning
 *
 * @description
 * Exports collected training data in formats compatible with:
 * - Unsloth (recommended for LoRA fine-tuning)
 * - Hugging Face transformers
 * - llama.cpp (for direct GGUF conversion)
 *
 * @module learning/fine-tune-export
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

/** @type {string} Training data directory */
const TRAINING_DIR = join(REPO_ROOT, 'data', 'training');

/** @type {string} Export directory */
const EXPORT_DIR = join(REPO_ROOT, 'data', 'export');

/**
 * @typedef {Object} ExportConfig
 * @property {string} baseModel - Base model for fine-tuning
 * @property {string} format - Export format (alpaca, sharegpt, chatml)
 * @property {number} maxExamples - Maximum examples to export
 * @property {boolean} shuffle - Shuffle examples before export
 * @property {number} trainSplit - Training split ratio (0-1)
 */

/**
 * Default export configuration
 * @type {ExportConfig}
 */
const DEFAULT_CONFIG = {
  baseModel: 'llama3.2:3b',
  format: 'alpaca',
  maxExamples: 10000,
  shuffle: true,
  trainSplit: 0.9
};

/**
 * Shuffles array in place
 * @param {any[]} array
 * @returns {any[]}
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Converts instruction format to Alpaca template
 * @param {Object} example
 * @returns {string}
 */
function toAlpacaFormat(example) {
  const { instruction, input, output, system } = example;

  if (input && input.trim()) {
    return `### Instruction:
${instruction}

### Input:
${input}

### Response:
${output}`;
  }

  return `### Instruction:
${instruction}

### Response:
${output}`;
}

/**
 * Converts to ChatML format (used by many models)
 * @param {Object} example
 * @returns {string}
 */
function toChatMLFormat(example) {
  const parts = [];

  if (example.system) {
    parts.push(`<|im_start|>system\n${example.system}<|im_end|>`);
  }

  if (example.instruction) {
    parts.push(`<|im_start|>user\n${example.instruction}${example.input ? '\n' + example.input : ''}<|im_end|>`);
    parts.push(`<|im_start|>assistant\n${example.output}<|im_end|>`);
  } else if (example.messages) {
    for (const msg of example.messages) {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      parts.push(`<|im_start|>${role}\n${msg.content}<|im_end|>`);
    }
  }

  return parts.join('\n');
}

/**
 * Converts to ShareGPT format (conversations)
 * @param {Object} example
 * @returns {Object}
 */
function toShareGPTFormat(example) {
  if (example.messages) {
    return {
      conversations: example.messages.map(m => ({
        from: m.role === 'assistant' ? 'gpt' : 'human',
        value: m.content
      }))
    };
  }

  return {
    conversations: [
      { from: 'human', value: example.instruction + (example.input ? '\n' + example.input : '') },
      { from: 'gpt', value: example.output }
    ]
  };
}

/**
 * Loads all training examples from JSONL files
 *
 * @param {string} [format] - Filter by format (instruction, conversation, preference)
 * @returns {Promise<any[]>}
 */
async function loadTrainingExamples(format = null) {
  try {
    const files = await readdir(TRAINING_DIR);
    const examples = [];

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      if (format && !file.startsWith(format)) continue;

      const content = await readFile(join(TRAINING_DIR, file), 'utf8');
      const lines = content.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          examples.push(JSON.parse(line));
        } catch {
          // Skip invalid lines
        }
      }
    }

    return examples;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Exports training data for Unsloth/QLoRA fine-tuning
 *
 * @param {Partial<ExportConfig>} [config={}] - Export configuration
 * @returns {Promise<{
 *   trainPath: string,
 *   evalPath: string,
 *   trainCount: number,
 *   evalCount: number,
 *   format: string
 * }>}
 *
 * @example
 * const result = await exportForUnsloth({
 *   baseModel: 'llama3.2:3b',
 *   format: 'alpaca',
 *   maxExamples: 5000
 * });
 */
export async function exportForUnsloth(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  await mkdir(EXPORT_DIR, { recursive: true });

  // Load all examples
  let examples = await loadTrainingExamples('instruction');

  // Also load conversations and convert to instruction format
  const conversations = await loadTrainingExamples('conversation');
  for (const conv of conversations) {
    if (conv.messages && conv.messages.length >= 2) {
      // Convert first exchange to instruction format
      const userMsg = conv.messages.find(m => m.role === 'user');
      const assistantMsg = conv.messages.find(m => m.role === 'assistant');

      if (userMsg && assistantMsg) {
        examples.push({
          instruction: userMsg.content,
          input: '',
          output: assistantMsg.content
        });
      }
    }
  }

  // Shuffle if requested
  if (cfg.shuffle) {
    examples = shuffleArray(examples);
  }

  // Limit examples
  examples = examples.slice(0, cfg.maxExamples);

  // Split into train/eval
  const splitIndex = Math.floor(examples.length * cfg.trainSplit);
  const trainExamples = examples.slice(0, splitIndex);
  const evalExamples = examples.slice(splitIndex);

  // Format based on config
  let formatFn;
  let extension = '.jsonl';

  switch (cfg.format) {
    case 'chatml':
      formatFn = toChatMLFormat;
      extension = '.txt';
      break;
    case 'sharegpt':
      formatFn = toShareGPTFormat;
      break;
    case 'alpaca':
    default:
      formatFn = (ex) => ex; // Keep as-is for Alpaca JSONL
  }

  // Export train set
  const trainPath = join(EXPORT_DIR, `train-${cfg.format}${extension}`);
  const trainContent = trainExamples
    .map(ex => cfg.format === 'chatml' ? formatFn(ex) : JSON.stringify(formatFn(ex)))
    .join(cfg.format === 'chatml' ? '\n\n' : '\n');
  await writeFile(trainPath, trainContent + '\n', 'utf8');

  // Export eval set
  const evalPath = join(EXPORT_DIR, `eval-${cfg.format}${extension}`);
  const evalContent = evalExamples
    .map(ex => cfg.format === 'chatml' ? formatFn(ex) : JSON.stringify(formatFn(ex)))
    .join(cfg.format === 'chatml' ? '\n\n' : '\n');
  await writeFile(evalPath, evalContent + '\n', 'utf8');

  // Export metadata
  const metadataPath = join(EXPORT_DIR, 'export-metadata.json');
  await writeFile(metadataPath, JSON.stringify({
    exportedAt: new Date().toISOString(),
    config: cfg,
    trainCount: trainExamples.length,
    evalCount: evalExamples.length,
    baseModel: cfg.baseModel,
    format: cfg.format
  }, null, 2), 'utf8');

  return {
    trainPath,
    evalPath,
    trainCount: trainExamples.length,
    evalCount: evalExamples.length,
    format: cfg.format
  };
}

/**
 * Generates a Google Colab notebook for fine-tuning
 *
 * @param {Object} [options={}] - Notebook options
 * @returns {Promise<string>} Path to generated notebook
 */
export async function generateColabNotebook(options = {}) {
  const {
    baseModel = 'unsloth/llama-3.2-3b-bnb-4bit',
    loraRank = 16,
    epochs = 3,
    batchSize = 2,
    learningRate = 2e-4
  } = options;

  const notebookPath = join(EXPORT_DIR, 'fine-tune-ollama.ipynb');

  const notebook = {
    nbformat: 4,
    nbformat_minor: 0,
    metadata: {
      colab: { provenance: [], gpuType: 'T4' },
      kernelspec: { name: 'python3', display_name: 'Python 3' },
      accelerator: 'GPU'
    },
    cells: [
      {
        cell_type: 'markdown',
        source: [
          '# Fine-tune Ollama Model with Unsloth\n',
          '\n',
          'This notebook fine-tunes a model for your Claude CLI interactions.\n',
          '\n',
          '**Steps:**\n',
          '1. Install dependencies\n',
          '2. Load base model with QLoRA\n',
          '3. Train on your data\n',
          '4. Export to GGUF for Ollama\n',
          '\n',
          '**Requirements:** GPU runtime (T4 or better)'
        ]
      },
      {
        cell_type: 'code',
        source: [
          '# Install Unsloth (optimized for Colab)\n',
          '!pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"\n',
          '!pip install --no-deps trl peft accelerate bitsandbytes'
        ],
        execution_count: null,
        outputs: []
      },
      {
        cell_type: 'code',
        source: [
          'from unsloth import FastLanguageModel\n',
          'import torch\n',
          '\n',
          '# Load base model with 4-bit quantization\n',
          `model, tokenizer = FastLanguageModel.from_pretrained(\n`,
          `    model_name="${baseModel}",\n`,
          '    max_seq_length=2048,\n',
          '    dtype=None,  # Auto-detect\n',
          '    load_in_4bit=True,\n',
          ')\n',
          '\n',
          '# Add LoRA adapters\n',
          'model = FastLanguageModel.get_peft_model(\n',
          '    model,\n',
          `    r=${loraRank},\n`,
          '    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",\n',
          '                    "gate_proj", "up_proj", "down_proj"],\n',
          '    lora_alpha=16,\n',
          '    lora_dropout=0,\n',
          '    bias="none",\n',
          '    use_gradient_checkpointing="unsloth",\n',
          ')'
        ],
        execution_count: null,
        outputs: []
      },
      {
        cell_type: 'code',
        source: [
          'from datasets import load_dataset\n',
          '\n',
          '# Upload your training data to Colab first!\n',
          '# Or use from Google Drive:\n',
          '# from google.colab import drive\n',
          '# drive.mount("/content/drive")\n',
          '\n',
          '# Load Alpaca-format dataset\n',
          'dataset = load_dataset("json", data_files={\n',
          '    "train": "train-alpaca.jsonl",\n',
          '    "eval": "eval-alpaca.jsonl"\n',
          '})\n',
          '\n',
          '# Alpaca prompt template\n',
          'alpaca_prompt = """### Instruction:\n',
          '{instruction}\n',
          '\n',
          '### Input:\n',
          '{input}\n',
          '\n',
          '### Response:\n',
          '{output}"""\n',
          '\n',
          'def format_prompts(examples):\n',
          '    texts = []\n',
          '    for instr, inp, out in zip(examples["instruction"], examples["input"], examples["output"]):\n',
          '        text = alpaca_prompt.format(instruction=instr, input=inp or "", output=out)\n',
          '        texts.append(text + tokenizer.eos_token)\n',
          '    return {"text": texts}\n',
          '\n',
          'dataset = dataset.map(format_prompts, batched=True)'
        ],
        execution_count: null,
        outputs: []
      },
      {
        cell_type: 'code',
        source: [
          'from trl import SFTTrainer\n',
          'from transformers import TrainingArguments\n',
          '\n',
          'trainer = SFTTrainer(\n',
          '    model=model,\n',
          '    tokenizer=tokenizer,\n',
          '    train_dataset=dataset["train"],\n',
          '    eval_dataset=dataset["eval"],\n',
          '    dataset_text_field="text",\n',
          '    max_seq_length=2048,\n',
          '    args=TrainingArguments(\n',
          '        output_dir="./outputs",\n',
          `        per_device_train_batch_size=${batchSize},\n`,
          '        gradient_accumulation_steps=4,\n',
          `        num_train_epochs=${epochs},\n`,
          `        learning_rate=${learningRate},\n`,
          '        warmup_steps=5,\n',
          '        fp16=not torch.cuda.is_bf16_supported(),\n',
          '        bf16=torch.cuda.is_bf16_supported(),\n',
          '        logging_steps=10,\n',
          '        save_steps=100,\n',
          '        eval_steps=50,\n',
          '        evaluation_strategy="steps",\n',
          '        optim="adamw_8bit",\n',
          '    ),\n',
          ')\n',
          '\n',
          '# Train!\n',
          'trainer.train()'
        ],
        execution_count: null,
        outputs: []
      },
      {
        cell_type: 'code',
        source: [
          '# Save LoRA adapter\n',
          'model.save_pretrained("lora-adapter")\n',
          'tokenizer.save_pretrained("lora-adapter")\n',
          '\n',
          '# Export to GGUF for Ollama\n',
          'model.save_pretrained_gguf(\n',
          '    "claude-cli-model",\n',
          '    tokenizer,\n',
          '    quantization_method="q4_k_m"  # Good balance of size/quality\n',
          ')\n',
          '\n',
          'print("\\n=== Model exported! ===")\n',
          'print("Download claude-cli-model-unsloth.Q4_K_M.gguf")\n',
          'print("\\nThen in Ollama:")\n',
          'print("1. Create Modelfile with: FROM ./claude-cli-model-unsloth.Q4_K_M.gguf")\n',
          'print("2. Run: ollama create my-claude-model -f Modelfile")'
        ],
        execution_count: null,
        outputs: []
      },
      {
        cell_type: 'markdown',
        source: [
          '## Import to Ollama\n',
          '\n',
          'After downloading the GGUF file, create a Modelfile:\n',
          '\n',
          '```dockerfile\n',
          'FROM ./claude-cli-model-unsloth.Q4_K_M.gguf\n',
          '\n',
          'PARAMETER temperature 0.7\n',
          'PARAMETER top_p 0.9\n',
          '\n',
          'SYSTEM "You are an AI assistant trained on Claude CLI interactions. You help with coding tasks, follow user preferences, and communicate in a helpful manner."\n',
          '```\n',
          '\n',
          'Then run:\n',
          '```bash\n',
          'ollama create my-claude-model -f Modelfile\n',
          'ollama run my-claude-model\n',
          '```'
        ]
      }
    ]
  };

  await writeFile(notebookPath, JSON.stringify(notebook, null, 2), 'utf8');

  return notebookPath;
}

/**
 * Generates Modelfile template for Ollama
 *
 * @param {Object} [options={}] - Modelfile options
 * @returns {Promise<string>} Path to Modelfile
 */
export async function generateModelfile(options = {}) {
  const {
    ggufPath = './model.gguf',
    temperature = 0.7,
    systemPrompt = 'You are an AI assistant trained on user interactions. You help with coding and follow user preferences.'
  } = options;

  const modelfilePath = join(EXPORT_DIR, 'Modelfile');

  const content = `# Ollama Modelfile for Fine-tuned Model
# Generated by Claude CLI Learning System

FROM ${ggufPath}

# Model parameters
PARAMETER temperature ${temperature}
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER num_predict 2048
PARAMETER stop "<|im_end|>"
PARAMETER stop "### Response:"

# System prompt
SYSTEM """${systemPrompt}"""

# Template (Alpaca format)
TEMPLATE """{{ if .System }}{{ .System }}

{{ end }}### Instruction:
{{ .Prompt }}

### Response:
{{ .Response }}"""
`;

  await writeFile(modelfilePath, content, 'utf8');

  return modelfilePath;
}

/**
 * Gets export statistics
 *
 * @returns {Promise<{
 *   hasExports: boolean,
 *   files: Array<{name: string, size: string, modified: string}>
 * }>}
 */
export async function getExportStats() {
  try {
    const files = await readdir(EXPORT_DIR);
    const fileStats = [];

    for (const file of files) {
      const filePath = join(EXPORT_DIR, file);
      const stats = await stat(filePath);
      fileStats.push({
        name: file,
        size: `${(stats.size / 1024).toFixed(2)} KB`,
        modified: stats.mtime.toISOString()
      });
    }

    return {
      hasExports: fileStats.length > 0,
      files: fileStats
    };
  } catch {
    return { hasExports: false, files: [] };
  }
}

export default {
  exportForUnsloth,
  generateColabNotebook,
  generateModelfile,
  getExportStats,
  loadTrainingExamples,
  EXPORT_DIR,
  TRAINING_DIR
};
