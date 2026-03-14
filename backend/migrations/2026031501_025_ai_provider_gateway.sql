-- Skarbiec Krasnali: Unified AI Provider Gateway
-- Credentials stored in Jaskier Vault (The Sentinel), NOT in PostgreSQL.
-- This table stores ONLY connection metadata for UI display and routing.

CREATE TABLE IF NOT EXISTS ch_ai_providers (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  plan_name TEXT NOT NULL DEFAULT '',
  plan_tier TEXT NOT NULL DEFAULT '',
  auth_type TEXT NOT NULL DEFAULT 'none',
  vault_namespace TEXT NOT NULL DEFAULT 'ai_providers',
  vault_service TEXT NOT NULL DEFAULT '',
  is_connected BOOLEAN NOT NULL DEFAULT FALSE,
  last_verified_at TIMESTAMPTZ,
  last_error TEXT,
  monthly_cost_cents INTEGER NOT NULL DEFAULT 0,
  config_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default providers
INSERT INTO ch_ai_providers (provider, plan_name, auth_type, vault_namespace, vault_service, monthly_cost_cents) VALUES
  ('anthropic', 'Claude Max', 'oauth_pkce', 'ai_providers', 'anthropic_max', 10000),
  ('openai', 'ChatGPT Plus', 'session_token', 'ai_providers', 'openai_session', 2000),
  ('google', 'Gemini Advanced', 'oauth_google', 'ai_providers', 'google_gemini', 1999),
  ('xai', 'X Premium+', 'cookie_session', 'ai_providers', 'xai_grok', 1600),
  ('deepseek', 'DeepSeek', 'api_key_via_vault', 'ai_providers', 'deepseek', 0),
  ('ollama', 'Ollama Local', 'none', 'ai_providers', 'ollama_local', 0)
ON CONFLICT (provider) DO NOTHING;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_ch_ai_providers_provider ON ch_ai_providers(provider);
CREATE INDEX IF NOT EXISTS idx_ch_ai_providers_connected ON ch_ai_providers(is_connected) WHERE is_connected = TRUE;
