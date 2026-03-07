-- Add stable UUID to projects so deployed apps survive slug renames
ALTER TABLE projects ADD COLUMN uuid UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX idx_projects_uuid ON projects (uuid);
