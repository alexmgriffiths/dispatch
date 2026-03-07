ALTER TABLE updates
    ADD COLUMN channel TEXT NOT NULL DEFAULT 'production',
    ADD COLUMN rollout_percentage INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
    ADD COLUMN is_critical BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN release_message TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS idx_updates_runtime_version_platform;
CREATE INDEX idx_updates_lookup ON updates (runtime_version, platform, channel, is_enabled, created_at DESC);
