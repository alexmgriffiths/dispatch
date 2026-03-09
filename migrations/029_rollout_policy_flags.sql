-- Links feature flags to rollout policies for health monitoring during executions
CREATE TABLE rollout_policy_flags (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL REFERENCES rollout_policies(id) ON DELETE CASCADE,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    UNIQUE(policy_id, flag_id)
);

CREATE INDEX idx_rollout_policy_flags_policy ON rollout_policy_flags(policy_id);
CREATE INDEX idx_rollout_policy_flags_flag ON rollout_policy_flags(flag_id);
