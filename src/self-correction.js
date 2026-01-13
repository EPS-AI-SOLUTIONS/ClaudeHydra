/**
 * HYDRA Self-Correction - Agentic code validation loop
 */

import { generate } from './ollama-client.js';

const CODER_MODEL = process.env.CODER_MODEL || 'qwen2.5-coder:1.5b';
const MAX_ATTEMPTS = 3;

/**
 * Detect programming language from code
 */
export function detectLanguage(code) {
  const patterns = {
    python: [/\bdef\s+\w+\s*\(/, /\bimport\s+\w+/, /\bclass\s+\w+:/, /print\s*\(/],
    javascript: [/\bfunction\s+\w+/, /\bconst\s+\w+\s*=/, /\blet\s+\w+/, /=>\s*{/],
    typescript: [/:\s*(string|number|boolean|any)/, /interface\s+\w+/, /<\w+>/],
    powershell: [/\$\w+\s*=/, /function\s+\w+-\w+/, /\bparam\s*\(/, /Write-Host/],
    rust: [/\bfn\s+\w+/, /\blet\s+mut\s+/, /\bimpl\s+/, /\bstruct\s+\w+/],
    go: [/\bfunc\s+\w+/, /\bpackage\s+\w+/, /\btype\s+\w+\s+struct/],
    sql: [/\bSELECT\b/i, /\bFROM\b/i, /\bWHERE\b/i, /\bINSERT\b/i],
    html: [/<html/i, /<div/i, /<script/i, /<\/\w+>/],
    css: [/\{[\s\S]*:\s*[\w#]+;/, /@media/, /\.[\w-]+\s*\{/],
    java: [/\bpublic\s+class/, /\bprivate\s+\w+/, /System\.out\.print/],
    csharp: [/\bnamespace\s+\w+/, /\bpublic\s+class/, /Console\.Write/]
  };

  for (const [lang, pats] of Object.entries(patterns)) {
    if (pats.some(p => p.test(code))) {
      return lang;
    }
  }

  return 'unknown';
}

/**
 * Extract code blocks from response
 */
export function extractCodeBlocks(text) {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks = [];
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || 'unknown',
      code: match[2].trim()
    });
  }

  return blocks;
}

/**
 * Validate code syntax (basic checks)
 */
export function validateSyntax(code, language) {
  const issues = [];

  // Common checks
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    issues.push(`Mismatched parentheses: ${openParens} open, ${closeParens} close`);
  }

  const openBraces = (code.match(/\{/g) || []).length;
  const closeBraces = (code.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    issues.push(`Mismatched braces: ${openBraces} open, ${closeBraces} close`);
  }

  const openBrackets = (code.match(/\[/g) || []).length;
  const closeBrackets = (code.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    issues.push(`Mismatched brackets: ${openBrackets} open, ${closeBrackets} close`);
  }

  // Language-specific checks
  if (language === 'python') {
    if (/:\s*$/.test(code) && !/^\s+/m.test(code.split(/:\s*$/)[1] || '')) {
      // This is a rough check, might have false positives
    }
  }

  if (language === 'javascript' || language === 'typescript') {
    if (code.includes('async ') && !code.includes('await') && !code.includes('Promise')) {
      issues.push('Warning: async function without await');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    language
  };
}

/**
 * Self-correction loop - validate and fix code
 */
export async function selfCorrect(code, options = {}) {
  const language = options.language || detectLanguage(code);
  const maxAttempts = options.maxAttempts || MAX_ATTEMPTS;
  const model = options.model || CODER_MODEL;

  let currentCode = code;
  let attempts = 0;
  const history = [];

  while (attempts < maxAttempts) {
    attempts++;

    // Validate current code
    const validation = validateSyntax(currentCode, language);
    history.push({
      attempt: attempts,
      valid: validation.valid,
      issues: validation.issues
    });

    if (validation.valid) {
      return {
        code: currentCode,
        language,
        valid: true,
        attempts,
        corrected: attempts > 1,
        history
      };
    }

    // Try to fix with AI
    const fixPrompt = `Fix the following ${language} code. It has these issues: ${validation.issues.join(', ')}

Return ONLY the corrected code without any explanation or markdown:

${currentCode}`;

    try {
      const result = await generate(model, fixPrompt, { timeout: 30000 });
      if (result.response) {
        // Extract code if wrapped in markdown
        const blocks = extractCodeBlocks('```\n' + result.response + '\n```');
        currentCode = blocks.length > 0 ? blocks[0].code : result.response.trim();
      }
    } catch (error) {
      history.push({ attempt: attempts, error: error.message });
      break;
    }
  }

  // Return last attempt even if not perfect
  return {
    code: currentCode,
    language,
    valid: false,
    attempts,
    corrected: attempts > 1,
    history
  };
}

/**
 * Generate code with automatic self-correction
 */
export async function generateWithCorrection(prompt, options = {}) {
  const model = options.generatorModel || process.env.DEFAULT_MODEL || 'llama3.2:3b';
  const coderModel = options.coderModel || CODER_MODEL;

  // Generate initial code
  const codePrompt = `${prompt}

Provide clean, working code with proper error handling.`;

  const result = await generate(model, codePrompt, { timeout: 60000 });

  if (!result.response) {
    return { error: 'Failed to generate code', prompt };
  }

  // Check if response contains code
  const blocks = extractCodeBlocks(result.response);
  if (blocks.length === 0) {
    // No code blocks, return as-is
    return {
      response: result.response,
      model: result.model,
      hasCode: false
    };
  }

  // Validate and correct each code block
  const correctedBlocks = [];
  for (const block of blocks) {
    const corrected = await selfCorrect(block.code, {
      language: block.language,
      model: coderModel
    });
    correctedBlocks.push(corrected);
  }

  // Rebuild response with corrected code
  let correctedResponse = result.response;
  for (let i = 0; i < blocks.length; i++) {
    const original = '```' + (blocks[i].language || '') + '\n' + blocks[i].code + '\n```';
    const fixed = '```' + correctedBlocks[i].language + '\n' + correctedBlocks[i].code + '\n```';
    correctedResponse = correctedResponse.replace(original, fixed);
  }

  return {
    response: correctedResponse,
    model: result.model,
    hasCode: true,
    codeBlocks: correctedBlocks.length,
    allValid: correctedBlocks.every(b => b.valid),
    corrections: correctedBlocks.filter(b => b.corrected).length,
    verified: true
  };
}
