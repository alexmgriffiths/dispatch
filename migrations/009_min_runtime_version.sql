-- Minimum runtime version policy: devices below this version get a "no update" response
-- with a header indicating they need an app store update.
ALTER TABLE channels ADD COLUMN min_runtime_version TEXT;
