# Health Metrics Manual Testing Guide

This guide covers testing the full health metrics pipeline: SDK event ingestion, anomaly detection, flag health snapshots, rollout health evaluation, and all UI surfaces.

## Prerequisites

1. Server running locally (`cargo run`)
2. A project exists (slug: `example`)
3. At least one feature flag exists and is enabled with variations
4. Know your project ID (check via `SELECT id, slug FROM projects;`)

Throughout this guide, replace `PROJECT_SLUG`, `CHANNEL`, and other placeholders with your actual values.

---

## 1. Basic Health Event Ingestion

### 1a. Send app_launch events with flag states

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-A",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [
      { "type": "app_launch", "count": 1, "flagStates": {"new-checkout": true, "dark-mode": "variant-a"} }
    ]
  }'
```

**Expected**: `204 No Content`

**Verify raw insert**:
```sql
SELECT * FROM health_events_raw
WHERE device_id = 'device-A'
ORDER BY received_at DESC LIMIT 5;
```

**Verify hourly aggregate**:
```sql
SELECT * FROM health_events_hourly
WHERE update_uuid = 'test-update-001'
AND event_type = 'app_launch'
ORDER BY bucket_hour DESC LIMIT 5;
```

### 1b. Send JS error events

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-A",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [
      { "type": "js_error", "message": "TypeError: undefined is not an object", "count": 2, "flagStates": {"new-checkout": true} }
    ]
  }'
```

### 1c. Send crash events

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-B",
    "channel": "production",
    "platform": "android",
    "runtimeVersion": "1.0.0",
    "events": [
      { "type": "crash", "message": "SIGSEGV in native module", "count": 1, "flagStates": {"new-checkout": true} }
    ]
  }'
```

### 1d. Send custom events

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-A",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [
      { "type": "custom", "name": "checkout_success", "count": 5 }
    ]
  }'
```

### 1e. Multiple events in one flush (realistic SDK behavior)

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-C",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [
      { "type": "app_launch", "count": 3, "flagStates": {"new-checkout": true} },
      { "type": "js_error", "message": "ReferenceError: x is not defined", "count": 1, "flagStates": {"new-checkout": true} },
      { "type": "custom", "name": "purchase_completed", "count": 2 }
    ]
  }'
```

---

## 2. Hourly Aggregation & Deduplication

### 2a. Verify upsert (not duplicate rows)

Send the same event type twice from the same device:

```bash
# First flush
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-D",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [{ "type": "app_launch", "count": 1, "flagStates": {"new-checkout": true} }]
  }'

# Second flush (same hour, same dimensions)
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-D",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [{ "type": "app_launch", "count": 1, "flagStates": {"new-checkout": true} }]
  }'
```

**Verify**: The hourly table should have ONE row with `total_count = 2` and `unique_devices = 2` (note: unique_devices increments per flush, not truly unique — this is a known simplification).

```sql
SELECT total_count, unique_devices FROM health_events_hourly
WHERE update_uuid = 'test-update-001'
AND event_type = 'app_launch'
ORDER BY bucket_hour DESC LIMIT 1;
```

### 2b. NULL update_uuid normalization

Send events without an updateUuid (pre-OTA devices):

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "deviceId": "device-E",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [{ "type": "app_launch", "count": 1 }]
  }'
```

**Verify**: Hourly row has `update_uuid = ''` (empty string, not NULL). Send again and confirm it upserts rather than creating a second row:

```sql
SELECT update_uuid, total_count FROM health_events_hourly
WHERE update_uuid = '' AND event_type = 'app_launch'
ORDER BY bucket_hour DESC LIMIT 1;
```

---

## 3. Channel-Aware Filtering

### 3a. Different channels produce separate rows

```bash
# Production channel
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-F",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [{ "type": "js_error", "message": "Error A", "count": 5, "flagStates": {"new-checkout": true} }]
  }'

# Staging channel
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-002",
    "deviceId": "device-G",
    "channel": "staging",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [{ "type": "js_error", "message": "Error B", "count": 3, "flagStates": {"new-checkout": false} }]
  }'
```

**Verify**: Separate rows in hourly table per channel:
```sql
SELECT channel_name, total_count FROM health_events_hourly
WHERE event_type = 'js_error'
ORDER BY bucket_hour DESC LIMIT 5;
```

---

## 4. Flag Health Snapshots

The flag health snapshot system computes per-variation error rates using a 24h rolling window.

### 4a. Build up healthy baseline

Send 100 launches with flag `new-checkout = true` and 0 errors:

```bash
for i in $(seq 1 10); do
  curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
    -H "Content-Type: application/json" \
    -d '{
      "projectSlug": "example",
      "updateUuid": "test-update-001",
      "deviceId": "device-healthy-'$i'",
      "channel": "production",
      "platform": "ios",
      "runtimeVersion": "1.0.0",
      "events": [
        { "type": "app_launch", "count": 10, "flagStates": {"new-checkout": true} }
      ]
    }'
done
```

**Verify snapshot**: Should show `status = 'healthy'`, low/zero error_rate:

```sql
SELECT fhs.*, ff.key AS flag_key
FROM flag_health_snapshots fhs
JOIN feature_flags ff ON ff.id = fhs.flag_id
WHERE fhs.channel_name = 'production'
ORDER BY fhs.recorded_at DESC LIMIT 10;
```

### 4b. Trigger degraded status (error_rate > 2%)

Send errors against the same flag variation (need > 2% of launches):

```bash
# With 100 launches above, 3 errors = 3% → degraded
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-err-1",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [
      { "type": "app_launch", "count": 1, "flagStates": {"new-checkout": true} },
      { "type": "js_error", "message": "TypeError in checkout", "count": 3, "flagStates": {"new-checkout": true} }
    ]
  }'
```

**Verify**:
```sql
SELECT status, error_rate, error_rate_delta, crash_free
FROM flag_health_snapshots
WHERE channel_name = 'production'
ORDER BY recorded_at DESC LIMIT 1;
```

**Expected**: `status = 'degraded'`, `error_rate` between 2.0 and 10.0.

### 4c. Trigger incident status (error_rate > 10%)

```bash
# Send many errors
for i in $(seq 1 5); do
  curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
    -H "Content-Type: application/json" \
    -d '{
      "projectSlug": "example",
      "updateUuid": "test-update-001",
      "deviceId": "device-incident-'$i'",
      "channel": "production",
      "platform": "ios",
      "runtimeVersion": "1.0.0",
      "events": [
        { "type": "app_launch", "count": 1, "flagStates": {"new-checkout": true} },
        { "type": "js_error", "message": "Fatal: checkout crash", "count": 10, "flagStates": {"new-checkout": true} }
      ]
    }'
done
```

**Verify**:
```sql
SELECT status, error_rate, crash_free
FROM flag_health_snapshots
WHERE channel_name = 'production'
ORDER BY recorded_at DESC LIMIT 1;
```

**Expected**: `status = 'incident'`, `error_rate > 10.0`.

### 4d. Per-variation isolation

Send events where different devices see different flag values:

```bash
# Devices seeing variation "true" — healthy
for i in $(seq 1 5); do
  curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
    -H "Content-Type: application/json" \
    -d '{
      "projectSlug": "example",
      "updateUuid": "test-update-001",
      "deviceId": "device-var-true-'$i'",
      "channel": "staging",
      "platform": "ios",
      "runtimeVersion": "1.0.0",
      "events": [
        { "type": "app_launch", "count": 10, "flagStates": {"new-checkout": true} }
      ]
    }'
done

# Devices seeing variation "false" — failing
for i in $(seq 1 5); do
  curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
    -H "Content-Type: application/json" \
    -d '{
      "projectSlug": "example",
      "updateUuid": "test-update-001",
      "deviceId": "device-var-false-'$i'",
      "channel": "staging",
      "platform": "ios",
      "runtimeVersion": "1.0.0",
      "events": [
        { "type": "app_launch", "count": 5, "flagStates": {"new-checkout": false} },
        { "type": "js_error", "message": "Fallback path broken", "count": 3, "flagStates": {"new-checkout": false} }
      ]
    }'
done
```

**Verify**: Two separate snapshots per variation — `true` should be healthy, `false` should be degraded/incident:

```sql
SELECT fhs.status, fhs.error_rate, fv.value AS variation_value
FROM flag_health_snapshots fhs
LEFT JOIN flag_variations fv ON fv.id = fhs.variation_id
WHERE fhs.channel_name = 'staging'
ORDER BY fhs.recorded_at DESC LIMIT 10;
```

---

## 5. Anomaly Detection

Anomalies trigger when current-hour error count > 2x the 24h rolling average, and only when current errors > 5.

### 5a. Build a 24h baseline

Insert historical hourly data directly (easier than waiting 24 hours):

```sql
-- Insert fake historical hourly data for the last 24 hours
INSERT INTO health_events_hourly
  (project_id, bucket_hour, channel_name, platform, runtime_version, update_uuid, event_type, event_name, total_count, unique_devices)
SELECT
  (SELECT id FROM projects WHERE slug = 'example'),
  NOW() - (n || ' hours')::interval,
  'production', 'ios', '1.0.0', 'test-update-001', 'js_error', NULL, 3, 1
FROM generate_series(1, 24) AS n;
```

This creates a baseline of ~3 errors per hour.

### 5b. Trigger anomaly (> 2x average)

Send > 6 errors in the current hour (2x of 3 = 6):

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-anomaly-1",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [
      { "type": "js_error", "message": "Massive failure", "count": 10, "flagStates": {"new-checkout": true} }
    ]
  }'
```

**Verify**: A `telemetry_events` row should be created:

```sql
SELECT event_type, severity, status, title, description, linked_flag_id
FROM telemetry_events
WHERE event_type = 'error_spike'
ORDER BY created_at DESC LIMIT 5;
```

**Expected**: `severity = 'warning'`, `status = 'degraded'`, title contains "Error spike on production channel".

### 5c. Critical anomaly (> 5x average)

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-anomaly-2",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [
      { "type": "crash", "message": "OOM kill", "count": 20, "flagStates": {"new-checkout": true} }
    ]
  }'
```

**Note**: Anomalies are deduplicated per hour — if you already triggered one in 5b for this hour, this won't create a second. To test critical separately, clear the telemetry_events or wait for the next hour.

**Expected** (if first anomaly this hour): `severity = 'critical'`, `status = 'incident'`.

### 5d. Anomaly deduplication

Send another batch of errors in the same hour:

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-anomaly-3",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [
      { "type": "js_error", "message": "Another error", "count": 15, "flagStates": {"new-checkout": true} }
    ]
  }'
```

**Verify**: Still only ONE telemetry_events row for this hour (not two):

```sql
SELECT COUNT(*) FROM telemetry_events
WHERE event_type = 'error_spike'
AND created_at >= date_trunc('hour', NOW());
```

---

## 6. Telemetry Daily Stats

### 6a. Verify daily stats upsert

After sending events from sections above, check:

```sql
SELECT date, channel_name, total_errors, total_launches, error_rate, crash_free, update_installs
FROM telemetry_daily_stats
WHERE project_id = (SELECT id FROM projects WHERE slug = 'example')
ORDER BY date DESC LIMIT 5;
```

**Expected**: Rows aggregated per day per channel, with error_rate and crash_free computed as percentages.

### 6b. Multiple flushes in same day

Send more events and verify they upsert (increment) rather than insert new rows:

```sql
-- Before: note current total_launches
SELECT total_launches FROM telemetry_daily_stats
WHERE date = CURRENT_DATE AND channel_name = 'production';
```

Send more launches, then verify the count increased.

---

## 7. Rollout Evaluator Health Checks

The evaluator runs every 60 seconds and checks `health_events_hourly` for running executions.

### 7a. Setup: Create a policy with health thresholds

1. Create a rollout policy with stages and thresholds via the UI or API
2. Ensure at least one stage has thresholds like:
   - `crash_rate lt 0.05` action `rollback` (rollback if crash rate >= 5%)
   - `js_error_rate lt 0.10` action `gate` (gate if JS error rate >= 10%)

### 7b. Gate threshold test

1. Start a rollout execution
2. Send health data matching the execution's channel with a high JS error rate:

```bash
# Send launches first (denominator)
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-gate-test",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [
      { "type": "app_launch", "count": 100, "flagStates": {"new-checkout": true} },
      { "type": "js_error", "message": "Threshold test error", "count": 15, "flagStates": {"new-checkout": true} }
    ]
  }'
```

**Verify** (after evaluator runs, ~60s):
```sql
SELECT health_status, gate_reason
FROM rollout_stage_history
WHERE execution_id = YOUR_EXECUTION_ID
ORDER BY started_at DESC LIMIT 1;
```

**Expected**: `health_status = 'gated'`, `gate_reason` contains the threshold details.

### 7c. Rollback threshold test

Send crash data exceeding the rollback threshold:

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-rollback-test",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [
      { "type": "app_launch", "count": 100, "flagStates": {"new-checkout": true} },
      { "type": "crash", "message": "Native crash", "count": 10, "flagStates": {"new-checkout": true} }
    ]
  }'
```

**Verify** (after evaluator runs):
```sql
SELECT status, rollback_reason FROM rollout_executions
WHERE id = YOUR_EXECUTION_ID;
```

**Expected**: `status = 'rolled_back'`, `rollback_reason` explains the threshold breach.

### 7d. No health data — evaluator skips threshold checks

Start an execution but send NO health data for its channel. The evaluator should still advance the execution based on `duration_minutes` alone (no health gate).

**Verify**: Check server logs for `"Skipping threshold checks — no app_launch data yet"`.

### 7e. Custom metric thresholds

If your policy has a custom metric threshold (e.g., `custom:checkout_success gt 10`):

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "updateUuid": "test-update-001",
    "deviceId": "device-custom-1",
    "channel": "production",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [
      { "type": "app_launch", "count": 50 },
      { "type": "custom", "name": "checkout_success", "count": 5 }
    ]
  }'
```

---

## 8. UI Verification

### 8a. Flag detail — Health panel

1. Open a feature flag detail page
2. The collapsible health panel should show per-variation health data
3. Switch channel tabs — health data should filter by channel
4. **Verify**: Variations with errors show degraded/incident badges with error rates

### 8b. Flag list — Health badges

1. On the flag list page, flags with health data should show the worst variation's status
2. **Verify**: Flags with `incident` status show a red badge, `degraded` shows yellow

### 8c. Execution detail — Per-flag health

1. Open a rollout execution detail page
2. Linked flags should show inline health indicators (error rate, crash free %)
3. **Verify**: Health updates arrive via SSE (no page refresh needed)

### 8d. Telemetry page — Timeseries

1. Open the Telemetry page (Insights nav group)
2. **Verify**: Error rate and crash-free timeseries charts populate from `telemetry_daily_stats`
3. **Verify**: Anomaly events appear in the events list

---

## 9. Edge Cases

### 9a. Unknown project slug

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "nonexistent",
    "deviceId": "device-X",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [{ "type": "app_launch", "count": 1 }]
  }'
```

**Expected**: `404` with `"Project not found"`.

### 9b. Invalid event type

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "deviceId": "device-X",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [{ "type": "invalid_type", "count": 1 }]
  }'
```

**Expected**: `500` — the `CHECK` constraint on `health_events_raw.event_type` rejects it. Valid types: `js_error`, `crash`, `custom`, `app_launch`.

### 9c. Empty events array

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "deviceId": "device-X",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": []
  }'
```

**Expected**: `204` — no-op, no rows inserted.

### 9d. No channel (NULL channel)

```bash
curl -s -X POST http://localhost:3000/v1/ota/health-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "projectSlug": "example",
    "deviceId": "device-X",
    "platform": "ios",
    "runtimeVersion": "1.0.0",
    "events": [{ "type": "app_launch", "count": 1 }]
  }'
```

**Expected**: `204`. Channel stored as NULL in raw, flag health snapshots default to `"default"`.

---

## 10. Cleanup & GC

### 10a. Verify GC cleans up old raw events

Insert old test data, then run GC:

```sql
INSERT INTO health_events_raw
  (project_id, device_id, platform, runtime_version, event_type, count, received_at)
VALUES
  ((SELECT id FROM projects WHERE slug = 'example'), 'gc-test', 'ios', '1.0.0', 'app_launch', 1, NOW() - INTERVAL '31 days');
```

Then trigger GC via the UI (Settings → Garbage Collection → Run) or API:

```bash
curl -s -X POST http://localhost:3000/v1/ota/gc \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectSlug": "example"}'
```

**Verify**:
```sql
SELECT COUNT(*) FROM health_events_raw WHERE device_id = 'gc-test';
```

**Expected**: 0 — the 31-day-old row was deleted.

---

## Quick Reset

To clear all test health data and start fresh:

```sql
DELETE FROM flag_health_snapshots;
DELETE FROM health_events_hourly;
DELETE FROM health_events_raw;
DELETE FROM telemetry_events WHERE event_type = 'error_spike';
DELETE FROM telemetry_daily_stats;
```

## Health Status Thresholds Reference

| Metric | Threshold | Status |
|--------|-----------|--------|
| error_rate | > 10% | `incident` |
| error_rate | > 2% | `degraded` |
| error_rate | <= 2% | `healthy` |

## Anomaly Detection Reference

| Condition | Severity | Status |
|-----------|----------|--------|
| current_hour > 5x 24h avg | `critical` | `incident` |
| current_hour > 2x 24h avg | `warning` | `degraded` |
| Minimum sample | > 5 errors in current hour before checking | — |
