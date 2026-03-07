CREATE TABLE IF NOT EXISTS updates (
    id BIGSERIAL PRIMARY KEY,
    runtime_version TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    update_uuid TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    expo_config JSONB NOT NULL DEFAULT '{}',
    is_rollback BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_updates_runtime_version_platform ON updates (runtime_version, platform, created_at DESC);

CREATE TABLE IF NOT EXISTS assets (
    id BIGSERIAL PRIMARY KEY,
    update_id BIGINT NOT NULL REFERENCES updates(id) ON DELETE CASCADE,
    s3_key TEXT NOT NULL,
    hash_sha256 TEXT NOT NULL,
    hash_md5 TEXT NOT NULL,
    file_extension TEXT NOT NULL,
    content_type TEXT NOT NULL,
    is_launch_asset BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_assets_update_id ON assets (update_id);
