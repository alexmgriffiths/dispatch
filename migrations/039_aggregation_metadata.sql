-- Track aggregation runs for "last updated" indicators
CREATE TABLE IF NOT EXISTS aggregation_runs (
    id BIGSERIAL PRIMARY KEY,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms BIGINT NOT NULL DEFAULT 0,
    projects_processed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_aggregation_runs_completed ON aggregation_runs (completed_at DESC);
