-- Ensure project_members role column accepts the new values.
-- Existing rows are all 'admin' (the default), so no data migration needed.
-- The valid roles are: 'admin', 'editor', 'viewer'.

-- Default new API keys to 'editor' (CI/CD write access, not admin)
ALTER TABLE api_keys ALTER COLUMN role SET DEFAULT 'editor';
-- Update existing API keys from 'admin' to 'editor' since they were created
-- before granular roles existed (CI/CD keys shouldn't have admin by default)
UPDATE api_keys SET role = 'editor' WHERE role = 'admin';
