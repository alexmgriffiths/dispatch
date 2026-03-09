-- Add raw counters so error_rate/crash_free are computed from actual totals, not averaged
ALTER TABLE telemetry_daily_stats
    ADD COLUMN IF NOT EXISTS total_errors BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_launches BIGINT NOT NULL DEFAULT 0;
