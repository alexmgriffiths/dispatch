CREATE TABLE IF NOT EXISTS user_overrides (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_overrides_project_user ON user_overrides (project_id, user_id);
CREATE INDEX idx_user_overrides_project ON user_overrides (project_id);
