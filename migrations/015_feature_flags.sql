CREATE TABLE IF NOT EXISTS feature_flags (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    flag_type TEXT NOT NULL DEFAULT 'boolean',  -- boolean, string, number, json
    default_value JSONB NOT NULL DEFAULT 'false',
    enabled BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_feature_flags_project_key ON feature_flags (project_id, key);
CREATE INDEX idx_feature_flags_project ON feature_flags (project_id);

CREATE TABLE IF NOT EXISTS flag_targeting_rules (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    priority INT NOT NULL DEFAULT 0,
    rule_type TEXT NOT NULL,  -- force, percentage_rollout, user_list
    variant_value JSONB NOT NULL,
    rule_config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flag_rules_flag ON flag_targeting_rules (flag_id);
CREATE INDEX idx_flag_rules_flag_priority ON flag_targeting_rules (flag_id, priority);
