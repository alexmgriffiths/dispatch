-- Add min_devices to stages
ALTER TABLE rollout_policy_stages ADD COLUMN IF NOT EXISTS min_devices INTEGER NOT NULL DEFAULT 0;

-- Per-stage health thresholds
CREATE TABLE IF NOT EXISTS rollout_stage_thresholds (
    id BIGSERIAL PRIMARY KEY,
    stage_id BIGINT NOT NULL REFERENCES rollout_policy_stages(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL CHECK (metric_type IN ('crash_rate', 'js_error_rate')),
    operator TEXT NOT NULL DEFAULT 'lt' CHECK (operator IN ('lt', 'lte', 'gt', 'gte')),
    value DOUBLE PRECISION NOT NULL,
    action TEXT NOT NULL DEFAULT 'gate' CHECK (action IN ('gate', 'rollback'))
);

CREATE INDEX idx_rollout_stage_thresholds_stage ON rollout_stage_thresholds(stage_id);

-- Track evaluator decisions on executions
ALTER TABLE rollout_stage_history ADD COLUMN IF NOT EXISTS gate_reason TEXT;
ALTER TABLE rollout_executions ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMPTZ;
ALTER TABLE rollout_executions ADD COLUMN IF NOT EXISTS rollback_reason TEXT;
