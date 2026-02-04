/**
 * PromptPrediction Module Tests
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  PromptPredictor,
  IntelligentQueue,
  createPredictionProvider,
  ComplexityAnalyzer,
  RoutingEngine,
  createPredictionSystem
} from '../src/prompt-prediction/index.js';

describe('PromptPredictor', () => {
  let predictor;

  beforeEach(() => {
    predictor = new PromptPredictor();
  });

  it('should learn from prompts', () => {
    predictor.learn('explain JavaScript closures');
    predictor.learn('explain JavaScript promises');
    predictor.learn('explain TypeScript generics');

    const stats = predictor.getStats();
    expect(stats.totalPrompts).toBe(3);
  });

  it('should predict based on learned patterns', () => {
    predictor.learn('how to implement authentication');
    predictor.learn('how to implement caching');
    predictor.learn('how to implement logging');

    const predictions = predictor.predict('how to');
    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions[0].text.toLowerCase()).toContain('how to');
  });

  it('should export and import state', () => {
    predictor.learn('test prompt one');
    predictor.learn('test prompt two');

    const exported = predictor.export();
    expect(exported.prompts).toBeDefined();

    const newPredictor = new PromptPredictor();
    newPredictor.import(exported);

    expect(newPredictor.getStats().totalPrompts).toBe(2);
  });
});

describe('ComplexityAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new ComplexityAnalyzer();
  });

  it('should classify simple prompts', () => {
    const result = analyzer.analyze('what is a variable');
    expect(result.level).toBe('simple');
    expect(result.score).toBeLessThan(3);
  });

  it('should classify complex prompts', () => {
    const result = analyzer.analyze(`
      Analyze the performance of this async function that handles
      database queries with parallel thread execution and memory
      caching. Include profiling data and optimization suggestions.
    `);
    expect(['complex', 'advanced']).toContain(result.level);
    expect(result.score).toBeGreaterThan(5);
  });

  it('should detect code presence', () => {
    const result = analyzer.analyze('```javascript\nconst x = 1;\n```');
    expect(result.features.hasCode).toBe(true);
  });

  it('should detect multi-task prompts', () => {
    const result = analyzer.analyze('1. First do this\n2. Then do that\n3. Finally this');
    expect(result.features.isMultiTask).toBe(true);
  });
});

describe('RoutingEngine', () => {
  let router;

  beforeEach(() => {
    router = new RoutingEngine({ preferLocal: true });
  });

  it('should route simple prompts to local models', () => {
    const result = router.selectProvider('what is a function');
    expect(result.provider).toBe('ollama');
    expect(result.local).toBe(true);
    expect(result.cost).toBe(0);
  });

  it('should consider complexity in routing', () => {
    const simple = router.selectProvider('list files');
    const complex = router.selectProvider(
      'design a microservices architecture with async message queuing, ' +
      'database sharding, and distributed caching strategy'
    );

    expect(simple.complexity.level).toBe('simple');
    expect(['complex', 'advanced']).toContain(complex.complexity.level);
  });

  it('should provide alternatives', () => {
    const result = router.selectProvider('analyze this code');
    expect(result.alternatives).toBeDefined();
    expect(Array.isArray(result.alternatives)).toBe(true);
  });
});

describe('IntelligentQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new IntelligentQueue();
  });

  afterEach(() => {
    queue.destroy();
  });

  it('should enqueue with routing info', () => {
    const result = queue.enqueue('test prompt');

    expect(result.id).toBeDefined();
    expect(result.routing).toBeDefined();
    expect(result.routing.provider).toBeDefined();
  });

  it('should dequeue items', () => {
    queue.enqueue('first prompt');
    queue.enqueue('second prompt');

    const item = queue.dequeue();
    expect(item).toBeDefined();
    expect(item.prompt).toBe('first prompt');
  });

  it('should track completion', () => {
    const { id } = queue.enqueue('test prompt');
    queue.dequeue();
    queue.complete(id, { response: 'done' });

    const status = queue.getStatus();
    expect(status.completed).toBe(1);
  });

  it('should find similar prompts', () => {
    queue.enqueue('explain JavaScript closures');
    queue.enqueue('explain JavaScript promises');
    queue.enqueue('how to use Docker');

    const similar = queue.findSimilar('explain JavaScript functions');
    expect(similar.length).toBeGreaterThan(0);
  });

  it('should export and import state', () => {
    queue.enqueue('test one');
    queue.enqueue('test two');

    const exported = queue.export();
    expect(exported.queue.length).toBe(2);

    const newQueue = new IntelligentQueue();
    newQueue.import(exported);
    expect(newQueue.getStatus().pending).toBe(2);
    newQueue.destroy();
  });
});

describe('PredictionProvider', () => {
  it('should create provider with correct interface', () => {
    const provider = createPredictionProvider();

    expect(provider.name).toBe('prompt-prediction');
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.learn).toBe('function');
  });

  it('should complete partial input', async () => {
    const provider = createPredictionProvider();

    // Learn some patterns
    provider.learn('how to implement authentication');
    provider.learn('how to implement caching');
    provider.learn('how to debug memory leaks');

    const result = await provider.complete('how to', 6);
    expect(result).toBeDefined();
    // May or may not have suggestions depending on confidence
  });
});

describe('createPredictionSystem', () => {
  let system;

  beforeEach(() => {
    system = createPredictionSystem();
  });

  afterEach(() => {
    system.destroy();
  });

  it('should create integrated system', () => {
    expect(system.predictor).toBeDefined();
    expect(system.queue).toBeDefined();
    expect(system.provider).toBeDefined();
  });

  it('should process prompts', () => {
    const result = system.process('test prompt');

    expect(result.id).toBeDefined();
    expect(result.routing).toBeDefined();
  });

  it('should provide predictions', () => {
    system.process('explain closures');
    system.process('explain promises');

    const predictions = system.predict('explain');
    expect(Array.isArray(predictions)).toBe(true);
  });

  it('should get combined stats', () => {
    system.process('test one');
    system.process('test two');

    const stats = system.getStats();
    expect(stats.predictor).toBeDefined();
    expect(stats.queue).toBeDefined();
  });
});
