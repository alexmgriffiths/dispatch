-- Track the targeting rule created by the rollout execution on each linked flag.
-- When execution starts, a percentage_rollout rule is created; this column stores
-- its ID so it can be updated on stage advance and deleted on completion/rollback.
ALTER TABLE rollout_execution_flags
    ADD COLUMN targeting_rule_id BIGINT REFERENCES flag_targeting_rules(id) ON DELETE SET NULL;
