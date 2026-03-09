-- Per-channel settings for each flag (enabled + default_value per environment)
CREATE TABLE IF NOT EXISTS flag_env_settings (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    channel_name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    default_value JSONB NOT NULL DEFAULT 'false',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_flag_env_flag_channel ON flag_env_settings (flag_id, channel_name);
CREATE INDEX idx_flag_env_flag ON flag_env_settings (flag_id);

-- Add channel_name to targeting rules (NULL = applies to all channels, for backwards compat)
ALTER TABLE flag_targeting_rules ADD COLUMN IF NOT EXISTS channel_name TEXT;
CREATE INDEX idx_flag_rules_channel ON flag_targeting_rules (flag_id, channel_name);
