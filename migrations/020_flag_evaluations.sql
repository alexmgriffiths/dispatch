-- Daily aggregated flag evaluation counts per variation per channel
CREATE TABLE IF NOT EXISTS flag_evaluation_counts (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    variation_id BIGINT REFERENCES flag_variations(id) ON DELETE SET NULL,
    channel_name TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    count BIGINT NOT NULL DEFAULT 0,
    UNIQUE(flag_id, variation_id, channel_name, date)
);

CREATE INDEX idx_flag_eval_counts_flag_date ON flag_evaluation_counts (flag_id, date DESC);
CREATE INDEX idx_flag_eval_counts_date ON flag_evaluation_counts (date DESC);
