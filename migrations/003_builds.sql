CREATE TABLE IF NOT EXISTS builds (
    id BIGSERIAL PRIMARY KEY,
    build_uuid TEXT NOT NULL UNIQUE,
    runtime_version TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    expo_config JSONB NOT NULL DEFAULT '{}',
    git_commit_hash TEXT,
    git_branch TEXT,
    ci_run_url TEXT,
    message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_builds_created ON builds (created_at DESC);

CREATE TABLE IF NOT EXISTS build_assets (
    id BIGSERIAL PRIMARY KEY,
    build_id BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
    s3_key TEXT NOT NULL,
    hash_sha256 TEXT NOT NULL,
    hash_md5 TEXT NOT NULL,
    file_extension TEXT NOT NULL,
    content_type TEXT NOT NULL,
    is_launch_asset BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_build_assets_build_id ON build_assets (build_id);

-- Track which build a published update came from
ALTER TABLE updates ADD COLUMN build_id BIGINT REFERENCES builds(id);
