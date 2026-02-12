// Types for Anthropic API model listing

/** Raw model object from Anthropic /v1/models API */
export interface AnthropicApiModel {
  id: string;
  created_at: string;
  display_name: string;
  type: 'model';
}

/** Anthropic API list models response */
export interface AnthropicModelsResponse {
  data: AnthropicApiModel[];
  first_id: string;
  last_id: string;
  has_more: boolean;
}

/** Normalized model for frontend consumption */
export interface AnthropicModel {
  id: string;
  displayName: string;
  provider: 'anthropic';
  createdAt: string;
  family: string;
  version: string;
  isLatest: boolean;
}
