-- Add detailed error/crash fields to health_events_raw
ALTER TABLE health_events_raw ADD COLUMN IF NOT EXISTS stack_trace TEXT;
ALTER TABLE health_events_raw ADD COLUMN IF NOT EXISTS error_name TEXT;
ALTER TABLE health_events_raw ADD COLUMN IF NOT EXISTS component_stack TEXT;
ALTER TABLE health_events_raw ADD COLUMN IF NOT EXISTS is_fatal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE health_events_raw ADD COLUMN IF NOT EXISTS tags JSONB;
