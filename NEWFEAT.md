Wire these first
Context evaluations endpoint — needs new backend route (GET /v1/ota/contexts/{id}/evaluations) + client function
Telemetry page — biggest gap, needs full backend: health events table, flag impact metrics, timeseries endpoints
Rollout mock data — add realistic mock data for policies/executions so mock mode is usable for development

Progressive Delivery with Guardrails — Implementation Plan
Architecture
The system uses the existing rollout_percentage on updates as the control lever. Progressive delivery automates that lever based on health data from devices.

Phase 1: Health Metrics Ingestion
Client SDK — extend the OpenFeature provider (or add a companion HealthReporter class) that:

Auto-captures JS exceptions via ErrorUtils.getGlobalHandler() on React Native
Accepts manual metrics: reporter.recordEvent("checkout_success"), reporter.recordError("payment_timeout")
Tracks the current update_uuid from expo-updates constants
Buffers and flushes every 30s (same pattern as eval reporting)
Endpoint: POST /v1/ota/health-metrics (public, like manifest)

{
"projectSlug": "my-app",
"updateUuid": "abc-123",
"deviceId": "device-xyz",
"channel": "production",
"platform": "ios",
"runtimeVersion": "1.0.0",
"events": [
{ "type": "js_error", "message": "TypeError: ...", "count": 3 },
{ "type": "crash", "count": 1 },
{ "type": "custom", "name": "checkout_success", "count": 5 },
{ "type": "app_launch", "count": 1 }
]
}
Storage: Two tables — raw events (TTL'd after 30 days) and hourly bucketed aggregates (used by the policy evaluator).

Phase 2: Rollout Policies
A declarative definition of how an update should progress:

{
"name": "safe-production-rollout",
"channel": "production",
"stages": [
{
"targetPercentage": 5,
"waitMinutes": 30,
"minDevices": 50,
"thresholds": [
{ "metricType": "crash_rate", "operator": "lt", "value": 0.02, "action": "rollback" },
{ "metricType": "js_error_rate", "operator": "lt", "value": 0.05, "action": "gate" }
]
},
{ "targetPercentage": 25, "waitMinutes": 60, "minDevices": 200, "thresholds": [...] },
{ "targetPercentage": 100, "waitMinutes": 0, "minDevices": 0, "thresholds": [] }
]
}
Rate calculations:

crash_rate = crash_count / app_launch_count
js_error_rate = js_error_count / app_launch_count
custom:<name> = raw count or average value
Optional relative mode: compare against a baseline update (e.g., "crash rate must be < 1.5x baseline")
Phase 3: Background Worker (Policy Evaluator)
A tokio::spawn loop in main.rs that ticks every 60 seconds:

Claim active executions with SELECT ... FOR UPDATE SKIP LOCKED (safe for multi-replica)
For each execution: check wait time elapsed, min devices met, query aggregated metrics
Check rollback thresholds first — if violated, immediately rollback
Check gate thresholds — if all pass, advance to next stage
At final stage with all passing: mark completed
Failure mode handling:

Server restart: all state is in the database, worker resumes on next tick
Delayed metrics: min_devices + wait_minutes prevents premature decisions
Zero app_launch events: skip evaluation (insufficient data), don't advance or rollback
Manual percentage change: worker detects mismatch, pauses execution to avoid fighting with manual overrides
Phase 4: Flag-Gated Releases
A flag_update_links table linking flags to updates:

kill_switch: if update rolls back, auto-disable the flag (even devices that already have the update get the feature turned off)
gate: informational — flag should be enabled only after update reaches sufficient rollout
The rollback handler (both auto and manual via handle_create_rollback) disables linked flags.

Phase 5: Database Schema
Single migration 023_progressive_delivery.sql with 8 tables:

health_metric_events — raw event log
health_metric_aggregates — hourly bucketed aggregates (UNIQUE on update + bucket + metric + channel + platform)
rollout_policies — policy definitions
rollout_policy_stages — ordered stages with target percentages
rollout_policy_thresholds — metric conditions per stage
rollout_executions — active policy runs (UNIQUE per update)
rollout_execution_log — audit trail of every promotion/rollback
flag_update_links — flag-to-update relationships
Phase 6: API Endpoints
Area Endpoints
Health (public) POST /v1/ota/health-metrics
Health (dashboard) GET /updates/{id}/health
Policies (editor+) CRUD on /rollout-policies
Executions (editor+) CRUD + /pause, /resume, /cancel, /advance on /rollout-executions
Flag links (editor+) CRUD on /flag-update-links
Phase 7: New Files
File Purpose
src/handlers/health_metrics.rs Ingestion + dashboard queries
src/handlers/rollout_policies.rs Policy CRUD
src/handlers/rollout_executions.rs Execution lifecycle
src/handlers/flag_update_links.rs Flag-update link CRUD
src/workers/mod.rs Module declaration
src/workers/rollout_evaluator.rs Core automation logic
src/workers/metric_cleanup.rs Aggregate recomputation + TTL cleanup
Modified: main.rs (spawn workers), routes.rs (add routes), models.rs (add structs), rollback.rs (disable linked flags), upload.rs (optionally auto-start execution)

Phase 8: Webhook Events
rollout.started, rollout.advanced, rollout.completed, rollout.rolled_back, rollout.paused, rollout.resumed, health.alert

Phase 9: Test Cases
Unit tests:

Health ingestion: valid batch accepted, aggregates upsert correctly, invalid project/update 404, duplicate events accumulate
Policy CRUD: valid stages (monotonically increasing percentages), reject non-monotonic, reject empty stages, reject percentage > 100
Execution: create sets update to first stage %, UNIQUE prevents double execution, pause/resume/cancel state transitions work correctly
Policy evaluator (core logic): crash_rate below threshold + wait elapsed → advances; crash_rate above rollback threshold → rolls back + disables flags; insufficient devices → waits; wait not elapsed → waits; final stage passing → completed; zero app_launch → skips; manual override detected → pauses
Flag links: auto-rollback disables linked flags; manual rollback via handle_create_rollback also disables; deleted link → flag untouched on rollback
Integration tests:

Happy path: create policy → create update at 5% → start execution → ingest good health metrics → worker advances to 25% → verify audit log + webhook
Rollback path: same but with bad metrics → verify update disabled, flag disabled, execution rolled_back, webhook with reason
Server restart resilience: start execution, kill worker, restart, verify correct stage resumption
Concurrent ingestion: multiple devices reporting simultaneously, verify no lost counts from upsert conflicts
Implementation Order
Migration + models (foundation)
Health metrics handler (can test independently)
Rollout policy CRUD (pure CRUD)
Rollout execution CRUD (manual controls)
Background worker (core automation — depends on 2-4)
Flag-update links (simple CRUD)
Integrate rollback with flag links
Auto-start execution on update create (optional)
Metric cleanup worker
SDK extension (TypeScript HealthReporter)

What's Implemented
Feature Status
Policy name + channel — Done
Stage percentage + waitMinutes — Done
minDevices — Done (migration 030, persisted + evaluated)
Thresholds (metricType, operator, value, action) — Done (migration 030, rollout_stage_thresholds table, CRUD, evaluation)
Execution lifecycle (create/pause/resume/cancel/advance) — Done
Health event ingestion from SDK — Done
Per-flag health snapshots — Done
Execution health metrics (crash_rate, js_error_rate) — Done (correct formula: count / app_launch_count)
Background evaluator — Done (tokio::spawn, 60s tick, FOR UPDATE SKIP LOCKED, auto-advance, auto-rollback, gate)
Gate vs rollback action distinction — Done (evaluator checks rollback first, then gate)
Kill-switch flag disabling on rollback — Done (auto + manual, migration 031)
Linked flags on policies — Done (returned in policy list/detail API)

What's Not Yet Implemented
1. Relative/baseline mode — no baseline tracking or comparison
2. custom:<name> metric types — only crash_rate and js_error_rate supported
3. Rollout lifecycle webhook events (rollout.started, .advanced, .completed, .rolled_back)
4. Auto-start execution on update publish (optional)
5. Test cases
