import type { AnthropicModel } from '../types/anthropic';
import type { ModelInfo } from './modelRegistry';

/** Convert AnthropicModel to ModelInfo for registry integration */
export function anthropicToModelInfo(model: AnthropicModel): ModelInfo {
  return {
    id: model.id,
    name: model.displayName,
    baseModel: model.id,
    version: model.version,
    createdAt: new Date(model.createdAt).getTime(),
    updatedAt: new Date(model.createdAt).getTime(),
    sampleCount: 0,
    metrics: {
      accuracy: 0,
      latencyMs: 0,
      tokensPerSecond: 0,
      errorRate: 0,
      userSatisfaction: 0,
      totalRequests: 0,
      successfulRequests: 0,
    },
    isActive: true,
    tags: ['cloud', 'anthropic', model.family],
    description: `${model.displayName} (Anthropic Cloud API)`,
  };
}
