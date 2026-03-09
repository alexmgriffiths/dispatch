-- Per-flag health snapshots reported by SDKs or external metrics pipelines
CREATE TABLE IF NOT EXISTS flag_health_snapshots (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    variation_id BIGINT REFERENCES flag_variations(id) ON DELETE SET NULL,
    channel_name TEXT,
    runtime_version TEXT NOT NULL DEFAULT '',
    devices INTEGER NOT NULL DEFAULT 0,
    error_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
    error_rate_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
    crash_free DOUBLE PRECISION NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'incident')),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flag_health_flag ON flag_health_snapshots (flag_id, recorded_at DESC);
CREATE INDEX idx_flag_health_flag_channel ON flag_health_snapshots (flag_id, channel_name, recorded_at DESC);
