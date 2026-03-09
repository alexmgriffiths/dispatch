-- Move flag linking from policies to executions so each release
-- can have its own set of linked flags while reusing the same policy template.
CREATE TABLE rollout_execution_flags (
    id BIGSERIAL PRIMARY KEY,
    execution_id BIGINT NOT NULL REFERENCES rollout_executions(id) ON DELETE CASCADE,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL DEFAULT 'kill_switch'
        CHECK (link_type IN ('kill_switch', 'gate', 'monitor')),
    UNIQUE(execution_id, flag_id)
);

CREATE INDEX idx_rollout_execution_flags_execution ON rollout_execution_flags(execution_id);
CREATE INDEX idx_rollout_execution_flags_flag ON rollout_execution_flags(flag_id);

-- Migrate any existing policy flag links to their active executions
INSERT INTO rollout_execution_flags (execution_id, flag_id, link_type)
SELECT DISTINCT e.id, rpf.flag_id, rpf.link_type
FROM rollout_policy_flags rpf
JOIN rollout_executions e ON e.policy_id = rpf.policy_id
ON CONFLICT DO NOTHING;
