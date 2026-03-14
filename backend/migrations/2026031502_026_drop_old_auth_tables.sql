-- Skarbiec Krasnali: Drop old auth tables
-- Credentials are now managed by Jaskier Vault (The Sentinel)
-- This migration removes legacy per-provider OAuth/token tables from PostgreSQL.
-- IMPORTANT: Run ONLY after credentials have been migrated to Vault via migrate_credentials_to_vault script.

-- Drop old Anthropic OAuth tokens table
DROP TABLE IF EXISTS ch_oauth_tokens CASCADE;

-- Drop old Google auth table (dual OAuth + API key)
DROP TABLE IF EXISTS ch_google_auth CASCADE;

-- Drop old GitHub OAuth table
DROP TABLE IF EXISTS ch_oauth_github CASCADE;

-- Drop old Vercel OAuth table
DROP TABLE IF EXISTS ch_oauth_vercel CASCADE;

-- Drop old service tokens table (Fly.io PAT etc.)
DROP TABLE IF EXISTS ch_service_tokens CASCADE;
