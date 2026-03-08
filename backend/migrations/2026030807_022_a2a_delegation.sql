-- A2A Agent Delegation tracking for call_agent tool
-- Logs all inter-agent delegations for monitoring and audit

CREATE TABLE IF NOT EXISTS ch_a2a_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL,
    agent_tier TEXT NOT NULL,
    caller_context TEXT,
    task_prompt TEXT NOT NULL,
    model_used TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'working',
    result_preview TEXT,
    call_depth INTEGER NOT NULL DEFAULT 1,
    iterations_used INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    is_error BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ch_a2a_tasks_agent ON ch_a2a_tasks(agent_name);
CREATE INDEX IF NOT EXISTS idx_ch_a2a_tasks_status ON ch_a2a_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ch_a2a_tasks_created ON ch_a2a_tasks(created_at DESC);
