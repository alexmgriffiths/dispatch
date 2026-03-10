-- Raw performance timing samples from SDK
CREATE TABLE IF NOT EXISTS performance_samples (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    channel_name TEXT,
    platform TEXT NOT NULL,
    runtime_version TEXT NOT NULL,
    metric_name TEXT NOT NULL CHECK (metric_name IN (
        'startup_cold', 'startup_warm', 'update_download', 'flag_eval'
    )),
    duration_ms DOUBLE PRECISION NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_perf_samples_project ON performance_samples (project_id, received_at DESC);
CREATE INDEX idx_perf_samples_metric ON performance_samples (project_id, metric_name, received_at DESC);

-- Hourly percentile aggregates for performance metrics
CREATE TABLE IF NOT EXISTS perf_hourly_aggregates (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    bucket_hour TIMESTAMPTZ NOT NULL,
    channel_name TEXT,
    platform TEXT,
    runtime_version TEXT,
    metric_name TEXT NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    p50 DOUBLE PRECISION NOT NULL DEFAULT 0,
    p95 DOUBLE PRECISION NOT NULL DEFAULT 0,
    p99 DOUBLE PRECISION NOT NULL DEFAULT 0,
    UNIQUE(project_id, bucket_hour, channel_name, platform, runtime_version, metric_name)
);

CREATE INDEX idx_perf_hourly_project ON perf_hourly_aggregates (project_id, bucket_hour DESC);
