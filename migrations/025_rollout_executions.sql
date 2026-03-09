CREATE TABLE rollout_executions (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id),
    policy_id BIGINT NOT NULL REFERENCES rollout_policies(id),
    update_group_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    current_stage INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ
);

CREATE INDEX idx_rollout_executions_project ON rollout_executions(project_id);
CREATE INDEX idx_rollout_executions_status ON rollout_executions(status) WHERE status IN ('running', 'paused');

CREATE TABLE rollout_stage_history (
    id BIGSERIAL PRIMARY KEY,
    execution_id BIGINT NOT NULL REFERENCES rollout_executions(id) ON DELETE CASCADE,
    stage_order INTEGER NOT NULL,
    percentage INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    health_status TEXT DEFAULT 'healthy'
);

CREATE INDEX idx_rollout_stage_history_execution ON rollout_stage_history(execution_id);
