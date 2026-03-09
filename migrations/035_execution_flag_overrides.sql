-- Store the intended flag state (target_enabled) and the pre-execution
-- snapshot (pre_execution_enabled) so rollback can restore the original state.
ALTER TABLE rollout_execution_flags
    ADD COLUMN target_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN pre_execution_enabled BOOLEAN;
