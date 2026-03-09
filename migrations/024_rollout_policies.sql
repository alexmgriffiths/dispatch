CREATE TABLE rollout_policies (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    channel TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    health_check_url TEXT,
    health_threshold_ms INTEGER DEFAULT 30000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rollout_policies_project ON rollout_policies(project_id);

CREATE TABLE rollout_policy_stages (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL REFERENCES rollout_policies(id) ON DELETE CASCADE,
    stage_order INTEGER NOT NULL,
    percentage INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    UNIQUE(policy_id, stage_order)
);

CREATE INDEX idx_rollout_policy_stages_policy ON rollout_policy_stages(policy_id);
