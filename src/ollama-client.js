/**
 * HYDRA Ollama Client - API wrapper for Ollama
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

/**
 * Call Ollama generate API
 */
export async function generate(model, prompt, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 60000);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: options.maxTokens ?? 2048,
          ...options.modelOptions
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      response: data.response,
      model: data.model,
      totalDuration: data.total_duration,
      evalCount: data.eval_count
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if Ollama is available
 */
export async function checkHealth() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return { available: false, error: response.statusText };

    const data = await response.json();
    return {
      available: true,
      models: data.models?.map(m => m.name) || [],
      host: OLLAMA_HOST
    };
  } catch (error) {
    return { available: false, error: error.message, host: OLLAMA_HOST };
  }
}

/**
 * List available models
 */
export async function listModels() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    const data = await response.json();
    return data.models?.map(m => ({
      name: m.name,
      size: m.size,
      modified: m.modified_at
    })) || [];
  } catch {
    return [];
  }
}

/**
 * Pull a model
 */
export async function pullModel(model) {
  const response = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: false })
  });

  return response.ok;
}
