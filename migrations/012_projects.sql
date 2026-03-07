-- Multi-tenancy: projects scope all data

CREATE TABLE IF NOT EXISTS projects (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

-- Add project_id to all scoped tables (nullable for backfill)
ALTER TABLE updates ADD COLUMN project_id BIGINT REFERENCES projects(id);
ALTER TABLE builds ADD COLUMN project_id BIGINT REFERENCES projects(id);
ALTER TABLE branches ADD COLUMN project_id BIGINT REFERENCES projects(id);
ALTER TABLE webhook_configs ADD COLUMN project_id BIGINT REFERENCES projects(id);
ALTER TABLE audit_log ADD COLUMN project_id BIGINT REFERENCES projects(id);
ALTER TABLE api_keys ADD COLUMN project_id BIGINT REFERENCES projects(id);

-- Channels: change PK from name to serial id (two projects can have "production")
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_branch_name_fkey;
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_rollout_branch_name_fkey;
ALTER TABLE channels DROP CONSTRAINT channels_pkey;
ALTER TABLE channels ADD COLUMN id BIGSERIAL PRIMARY KEY;
ALTER TABLE channels ADD COLUMN project_id BIGINT REFERENCES projects(id);

-- Branches: allow same name in different projects
ALTER TABLE branches DROP CONSTRAINT IF EXISTS branches_name_key;

-- Create default project if any data exists, and backfill
DO $$
DECLARE
    default_project_id BIGINT;
BEGIN
    IF EXISTS (SELECT 1 FROM updates LIMIT 1)
       OR EXISTS (SELECT 1 FROM builds LIMIT 1)
       OR EXISTS (SELECT 1 FROM branches LIMIT 1)
       OR EXISTS (SELECT 1 FROM users LIMIT 1) THEN

        INSERT INTO projects (name, slug) VALUES ('Default Project', 'default')
        RETURNING id INTO default_project_id;

        UPDATE updates SET project_id = default_project_id WHERE project_id IS NULL;
        UPDATE builds SET project_id = default_project_id WHERE project_id IS NULL;
        UPDATE branches SET project_id = default_project_id WHERE project_id IS NULL;
        UPDATE channels SET project_id = default_project_id WHERE project_id IS NULL;
        UPDATE webhook_configs SET project_id = default_project_id WHERE project_id IS NULL;
        UPDATE audit_log SET project_id = default_project_id WHERE project_id IS NULL;
        UPDATE api_keys SET project_id = default_project_id WHERE project_id IS NULL;

        -- Assign all existing users to default project
        INSERT INTO project_members (project_id, user_id, role)
        SELECT default_project_id, id, 'admin' FROM users
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- Project-scoped unique constraints
CREATE UNIQUE INDEX idx_branches_project_name ON branches (project_id, name);
CREATE UNIQUE INDEX idx_channels_project_name ON channels (project_id, name);

-- Indexes for project scoping
CREATE INDEX idx_updates_project ON updates (project_id);
CREATE INDEX idx_builds_project ON builds (project_id);
CREATE INDEX idx_webhooks_project ON webhook_configs (project_id);
CREATE INDEX idx_audit_project ON audit_log (project_id);
CREATE INDEX idx_api_keys_project ON api_keys (project_id);
