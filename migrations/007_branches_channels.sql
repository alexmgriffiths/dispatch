-- Branches: updates are published to branches
CREATE TABLE IF NOT EXISTS branches (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Channels: clients connect to channels, which point to branches
CREATE TABLE IF NOT EXISTS channels (
    name TEXT PRIMARY KEY,
    branch_name TEXT NOT NULL REFERENCES branches(name) ON UPDATE CASCADE,
    -- For branch-based rollouts: gradually shift traffic from one branch to another
    rollout_branch_name TEXT REFERENCES branches(name) ON UPDATE CASCADE,
    rollout_percentage INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add branch_name to updates (where updates are actually published)
ALTER TABLE updates ADD COLUMN branch_name TEXT;

-- Seed default branch + channel from existing data
INSERT INTO branches (name)
SELECT DISTINCT channel FROM updates
ON CONFLICT (name) DO NOTHING;

-- Also ensure 'production' branch exists
INSERT INTO branches (name) VALUES ('production')
ON CONFLICT (name) DO NOTHING;

-- Backfill: set branch_name = channel for existing updates
UPDATE updates SET branch_name = channel WHERE branch_name IS NULL;

-- Create default channels pointing to same-named branches
INSERT INTO channels (name, branch_name)
SELECT DISTINCT channel, channel FROM updates
ON CONFLICT (name) DO NOTHING;

-- Ensure production channel exists
INSERT INTO channels (name, branch_name) VALUES ('production', 'production')
ON CONFLICT (name) DO NOTHING;

-- Index for branch lookups
CREATE INDEX idx_updates_branch_name ON updates (branch_name);
