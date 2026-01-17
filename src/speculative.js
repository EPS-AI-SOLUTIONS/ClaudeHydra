/**
 * HYDRA Speculative Decoding - Parallel model racing
 */

import { generate } from './ollama-client.js';
import { getCache, setCache } from './cache.js';

const FAST_MODEL = process.env.FAST_MODEL || 'llama3.2:1b';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'llama3.2:3b';
const MIN_VALID_LENGTH = 50;

/**
 * Speculative decoding - race fast vs accurate model
 * Returns first valid response, with quality fallback
 */
export async function speculativeGenerate(prompt, options = {}) {
  const fastModel = options.fastModel || FAST_MODEL;
  const accurateModel = options.accurateModel || DEFAULT_MODEL;
  const timeout = options.timeout || 30000;

  // Check cache first
  const cached = getCache(prompt, 'speculative');
  if (cached) {
    return {
      ...cached,
      source: `CACHE (${cached.source})`
    };
  }

  // Create racing promises
  const fastPromise = generate(fastModel, prompt, { timeout })
    .then((r) => ({ ...r, source: 'speed', model: fastModel }))
    .catch(() => null);

  const accuratePromise = generate(accurateModel, prompt, { timeout })
    .then((r) => ({ ...r, source: 'quality', model: accurateModel }))
    .catch(() => null);

  // Race with validation
  const startTime = Date.now();

  try {
    // Wait for first result
    const winner = await Promise.race([fastPromise, accuratePromise]);

    if (
      winner &&
      winner.response &&
      winner.response.length >= MIN_VALID_LENGTH
    ) {
      // Fast model won with valid response
      const result = {
        response: winner.response,
        source: winner.source,
        model: winner.model,
        duration: Date.now() - startTime,
        winner: 'first'
      };

      setCache(prompt, result.response, 'speculative', result.source);
      return result;
    }

    // Fast response too short, wait for accurate
    const accurate = await accuratePromise;
    if (accurate && accurate.response) {
      const result = {
        response: accurate.response,
        source: accurate.source,
        model: accurate.model,
        duration: Date.now() - startTime,
        winner: 'quality-fallback'
      };

      setCache(prompt, result.response, 'speculative', result.source);
      return result;
    }

    throw new Error('Both models failed to produce valid output');
  } catch (error) {
    return {
      response: null,
      error: error.message,
      source: 'error',
      duration: Date.now() - startTime
    };
  }
}

/**
 * Model race - race N models, first valid wins
 */
export async function modelRace(prompt, models, options = {}) {
  const timeout = options.timeout || 30000;
  const startTime = Date.now();

  const promises = models.map((model) =>
    generate(model, prompt, { timeout })
      .then((r) => ({ ...r, model, success: true }))
      .catch((e) => ({ model, success: false, error: e.message }))
  );

  // Wait for all to complete (or use Promise.race for first)
  if (options.firstWins) {
    const validPromises = promises.map((p) =>
      p.then((r) =>
        r.success && r.response?.length >= MIN_VALID_LENGTH
          ? r
          : Promise.reject()
      )
    );

    try {
      const winner = await Promise.any(validPromises);
      return {
        response: winner.response,
        model: winner.model,
        source: 'race-winner',
        duration: Date.now() - startTime,
        totalModels: models.length
      };
    } catch {
      return { error: 'No model produced valid output', models };
    }
  }

  // Wait for all and return best
  const results = await Promise.all(promises);
  const valid = results.filter(
    (r) => r.success && r.response?.length >= MIN_VALID_LENGTH
  );

  if (valid.length === 0) {
    return { error: 'No model produced valid output', models };
  }

  // Return longest response as "best"
  const best = valid.reduce((a, b) =>
    (a.response?.length || 0) > (b.response?.length || 0) ? a : b
  );

  return {
    response: best.response,
    model: best.model,
    source: 'race-best',
    duration: Date.now() - startTime,
    totalModels: models.length,
    validResponses: valid.length
  };
}

/**
 * Consensus generation - run multiple models and check agreement
 */
export async function consensusGenerate(prompt, models, options = {}) {
  const timeout = options.timeout || 60000;
  const startTime = Date.now();

  const promises = models.map((model) =>
    generate(model, prompt, { timeout })
      .then((r) => ({ response: r.response, model, success: true }))
      .catch(() => ({ model, success: false }))
  );

  const results = await Promise.all(promises);
  const valid = results.filter((r) => r.success && r.response);

  if (valid.length === 0) {
    return { error: 'No model produced output', consensus: false };
  }

  if (valid.length === 1) {
    return {
      response: valid[0].response,
      model: valid[0].model,
      consensus: false,
      reason: 'single-response',
      duration: Date.now() - startTime
    };
  }

  // Simple similarity check (first 100 chars)
  const normalized = valid.map((v) =>
    v.response.toLowerCase().substring(0, 100).trim()
  );
  const similar = normalized.every(
    (n) =>
      normalized[0].includes(n.substring(0, 30)) ||
      n.includes(normalized[0].substring(0, 30))
  );

  return {
    response: valid[0].response, // Return first as primary
    model: valid[0].model,
    consensus: similar,
    agreement: similar ? 'high' : 'low',
    responses: valid.length,
    duration: Date.now() - startTime
  };
}
