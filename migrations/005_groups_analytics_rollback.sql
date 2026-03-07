-- Update groups: link iOS + Android updates together
ALTER TABLE updates ADD COLUMN group_id TEXT;
CREATE INDEX idx_updates_group_id ON updates (group_id);

-- Rollback to specific update (not just embedded)
ALTER TABLE updates ADD COLUMN rollback_to_update_id BIGINT REFERENCES updates(id);

-- Fingerprint-based runtime versioning
ALTER TABLE updates ADD COLUMN runtime_fingerprint TEXT;
ALTER TABLE builds ADD COLUMN runtime_fingerprint TEXT;

-- Analytics: manifest download tracking
CREATE TABLE IF NOT EXISTS update_analytics (
    id BIGSERIAL PRIMARY KEY,
    update_id BIGINT NOT NULL REFERENCES updates(id) ON DELETE CASCADE,
    device_id TEXT,
    platform TEXT NOT NULL,
    runtime_version TEXT NOT NULL,
    event TEXT NOT NULL DEFAULT 'download',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_update_id ON update_analytics (update_id);
CREATE INDEX idx_analytics_device_id ON update_analytics (device_id);
CREATE INDEX idx_analytics_created_at ON update_analytics (created_at DESC);
