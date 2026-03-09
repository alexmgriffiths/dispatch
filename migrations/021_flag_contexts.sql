-- Stores unique evaluation contexts seen by the feature flag system
CREATE TABLE IF NOT EXISTS flag_contexts (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    targeting_key TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'user',
    name TEXT,
    attributes JSONB NOT NULL DEFAULT '{}',
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluation_count BIGINT NOT NULL DEFAULT 0,
    UNIQUE(project_id, targeting_key, kind)
);

CREATE INDEX idx_flag_contexts_project ON flag_contexts (project_id, last_seen_at DESC);
CREATE INDEX idx_flag_contexts_kind ON flag_contexts (project_id, kind);
CREATE INDEX idx_flag_contexts_targeting_key ON flag_contexts (project_id, targeting_key);

-- Tracks which flags a context has been evaluated against
CREATE TABLE IF NOT EXISTS flag_context_evaluations (
    id BIGSERIAL PRIMARY KEY,
    context_id BIGINT NOT NULL REFERENCES flag_contexts(id) ON DELETE CASCADE,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    variation_value JSONB,
    channel_name TEXT,
    last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluation_count BIGINT NOT NULL DEFAULT 0,
    UNIQUE(context_id, flag_id, channel_name)
);

CREATE INDEX idx_flag_ctx_evals_context ON flag_context_evaluations (context_id, last_evaluated_at DESC);
CREATE INDEX idx_flag_ctx_evals_flag ON flag_context_evaluations (flag_id);
