-- Correlated telemetry events (anomalies auto-attributed to flags/updates)
CREATE TABLE IF NOT EXISTS telemetry_events (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('crash_spike', 'error_spike', 'latency_spike', 'adoption_drop')),
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('critical', 'warning', 'info')),
    status TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('incident', 'degraded', 'healthy')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    linked_flag_id BIGINT REFERENCES feature_flags(id) ON DELETE SET NULL,
    linked_flag_variation TEXT,
    linked_update_id BIGINT REFERENCES updates(id) ON DELETE SET NULL,
    affected_devices INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_telemetry_events_project ON telemetry_events (project_id, created_at DESC);
CREATE INDEX idx_telemetry_events_flag ON telemetry_events (linked_flag_id);

-- Daily telemetry snapshots for timeseries charts
CREATE TABLE IF NOT EXISTS telemetry_daily_stats (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    channel_name TEXT,
    error_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
    crash_free DOUBLE PRECISION NOT NULL DEFAULT 100,
    flag_evals BIGINT NOT NULL DEFAULT 0,
    update_installs BIGINT NOT NULL DEFAULT 0,
    UNIQUE(project_id, date, channel_name)
);

CREATE INDEX idx_telemetry_daily_project ON telemetry_daily_stats (project_id, date DESC);
