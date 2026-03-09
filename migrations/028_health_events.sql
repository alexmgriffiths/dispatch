-- Raw health events from SDK (TTL'd after 30 days)
CREATE TABLE IF NOT EXISTS health_events_raw (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    update_uuid TEXT,
    device_id TEXT NOT NULL,
    channel_name TEXT,
    platform TEXT NOT NULL,
    runtime_version TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('js_error', 'crash', 'custom', 'app_launch')),
    event_name TEXT,
    event_message TEXT,
    count INTEGER NOT NULL DEFAULT 1,
    flag_states JSONB,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_raw_project ON health_events_raw (project_id, received_at DESC);
CREATE INDEX idx_health_raw_cleanup ON health_events_raw (received_at);
CREATE INDEX idx_health_raw_update ON health_events_raw (update_uuid, event_type);

-- Hourly bucketed aggregates (computed from raw events, used by policy evaluator)
CREATE TABLE IF NOT EXISTS health_events_hourly (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    bucket_hour TIMESTAMPTZ NOT NULL,
    channel_name TEXT,
    platform TEXT NOT NULL,
    runtime_version TEXT NOT NULL,
    update_uuid TEXT,
    event_type TEXT NOT NULL,
    event_name TEXT,
    total_count BIGINT NOT NULL DEFAULT 0,
    unique_devices INTEGER NOT NULL DEFAULT 0,
    UNIQUE(project_id, bucket_hour, channel_name, platform, runtime_version, update_uuid, event_type, event_name)
);

CREATE INDEX idx_health_hourly_project ON health_events_hourly (project_id, bucket_hour DESC);
CREATE INDEX idx_health_hourly_channel ON health_events_hourly (project_id, channel_name, bucket_hour DESC);
