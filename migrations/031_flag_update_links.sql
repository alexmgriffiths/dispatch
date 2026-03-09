-- Phase 4: Flag-Gated Releases
-- Add link_type to rollout_policy_flags:
--   kill_switch = auto-disable flag when execution rolls back (default)
--   gate       = informational — flag should be enabled only after sufficient rollout
--   monitor    = health monitoring only, no automatic action
ALTER TABLE rollout_policy_flags
    ADD COLUMN IF NOT EXISTS link_type TEXT NOT NULL DEFAULT 'kill_switch'
    CHECK (link_type IN ('kill_switch', 'gate', 'monitor'));
