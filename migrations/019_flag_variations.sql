-- Flag variations: define the set of possible values a flag can serve
CREATE TABLE IF NOT EXISTS flag_variations (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    value JSONB NOT NULL,
    name TEXT,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flag_variations_flag ON flag_variations (flag_id, sort_order);
