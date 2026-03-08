-- Configurable A2A delegation parameters in settings
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS agent_max_call_depth INTEGER NOT NULL DEFAULT 3;
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS agent_max_iterations INTEGER NOT NULL DEFAULT 8;
