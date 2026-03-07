-- Add actor tracking to audit log
ALTER TABLE audit_log ADD COLUMN actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN actor_api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL;
