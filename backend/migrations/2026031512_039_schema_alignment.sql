-- Schema alignment: add columns expected by shared jaskier-core handlers
-- These columns exist in Quad Hydra init migrations but were missing from CH's
-- original init (001) and were never backfilled.

-- 1. ch_sessions: add agent_id column (used by shared list_sessions LEFT JOIN)
ALTER TABLE ch_sessions ADD COLUMN IF NOT EXISTS agent_id TEXT DEFAULT NULL;

-- 2. ch_settings: add columns expected by shared get_settings / update_settings
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS use_docker_sandbox BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS top_p DOUBLE PRECISION NOT NULL DEFAULT 0.95;
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS response_style TEXT NOT NULL DEFAULT 'balanced';
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS thinking_level TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS force_model TEXT DEFAULT NULL;
