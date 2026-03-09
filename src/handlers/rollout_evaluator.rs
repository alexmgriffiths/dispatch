//! Background rollout evaluator.
//!
//! Periodically checks all running executions and, for each one:
//!   1. Computes current health metrics (crash_rate, js_error_rate)
//!   2. Checks if the current stage's waitMinutes has elapsed
//!   3. Checks if minDevices threshold is met
//!   4. Evaluates all thresholds for the current stage
//!   5. Takes action:
//!      - If a "rollback" threshold is breached → roll back the execution
//!      - If a "gate" threshold is breached → hold (don't advance)
//!      - If all thresholds pass + wait time elapsed + min devices met → advance

use sqlx::PgPool;

use crate::execution_events::{ExecutionEvent, ExecutionEventRegistry};
use crate::models::{RolloutExecution, RolloutPolicyStage, RolloutStageThreshold};

/// Spawn the evaluator loop. Call this once from main().
pub fn spawn_evaluator(db: PgPool, events: ExecutionEventRegistry) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            if let Err(e) = evaluate_all(&db, &events).await {
                tracing::error!(error = %e, "Rollout evaluator tick failed");
            }
        }
    });
}

async fn evaluate_all(db: &PgPool, events: &ExecutionEventRegistry) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Claim running executions with row-level locking (safe for multi-replica).
    // SKIP LOCKED means other replicas won't evaluate the same execution concurrently.
    // We read inside a transaction so FOR UPDATE SKIP LOCKED is effective,
    // but release the lock quickly — each execution is evaluated independently.
    let executions = {
        let mut tx = db.begin().await?;
        let rows = sqlx::query_as::<_, RolloutExecution>(
            "SELECT * FROM rollout_executions WHERE status = 'running' \
             FOR UPDATE SKIP LOCKED",
        )
        .fetch_all(&mut *tx)
        .await?;
        tx.commit().await?;
        rows
    };

    if executions.is_empty() {
        return Ok(());
    }

    for execution in &executions {
        if let Err(e) = evaluate_execution(db, events, execution).await {
            tracing::error!(
                execution_id = execution.id,
                error = %e,
                "Failed to evaluate execution"
            );
        }
    }

    Ok(())
}

async fn evaluate_execution(
    db: &PgPool,
    events: &ExecutionEventRegistry,
    execution: &RolloutExecution,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Get stages for this execution's policy
    let stages = sqlx::query_as::<_, RolloutPolicyStage>(
        "SELECT * FROM rollout_policy_stages WHERE policy_id = $1 ORDER BY stage_order",
    )
    .bind(execution.policy_id)
    .fetch_all(db)
    .await?;

    // Find current stage
    let current_stage = stages
        .iter()
        .find(|s| s.stage_order == execution.current_stage);

    let current_stage = match current_stage {
        Some(s) => s,
        None => {
            // Past last stage or stage mismatch — complete the execution
            complete_execution(db, events, execution).await?;
            return Ok(());
        }
    };

    // Get thresholds for this stage
    let thresholds = sqlx::query_as::<_, RolloutStageThreshold>(
        "SELECT * FROM rollout_stage_thresholds WHERE stage_id = $1",
    )
    .bind(current_stage.id)
    .fetch_all(db)
    .await?;

    // Compute current health metrics
    let metrics = compute_metrics(db, execution).await?;

    // Update last_evaluated_at
    sqlx::query("UPDATE rollout_executions SET last_evaluated_at = NOW() WHERE id = $1")
        .bind(execution.id)
        .execute(db)
        .await?;

    // Check thresholds — but only if we have health data to evaluate against.
    // With zero app_launch events we skip threshold checks (no data to judge)
    // but still allow advancement based on wait time and min devices below.
    if metrics.app_launches == 0 && !thresholds.is_empty() {
        tracing::debug!(
            execution_id = execution.id,
            "No app_launch events yet, skipping threshold evaluation"
        );
    }

    if metrics.app_launches > 0 {
    for threshold in &thresholds {
        let current_value = match threshold.metric_type.as_str() {
            "crash_rate" => metrics.crash_rate,
            "js_error_rate" => metrics.js_error_rate,
            s if s.starts_with("custom:") => {
                let name = &s["custom:".len()..];
                metrics.custom.get(name).copied().unwrap_or(0) as f64
            }
            _ => continue,
        };

        let breached = !evaluate_threshold(current_value, &threshold.operator, threshold.value);

        if breached {
            match threshold.action.as_str() {
                "rollback" => {
                    let reason = format!(
                        "{} {:.4} breached threshold ({} {})",
                        threshold.metric_type, current_value, threshold.operator, threshold.value
                    );
                    tracing::warn!(
                        execution_id = execution.id,
                        threshold = %threshold.metric_type,
                        value = current_value,
                        limit = threshold.value,
                        "Rollback threshold breached"
                    );
                    rollback_execution(db, events, execution, &reason).await?;
                    return Ok(());
                }
                "gate" => {
                    let reason = format!(
                        "{} {:.4} does not meet threshold ({} {})",
                        threshold.metric_type, current_value, threshold.operator, threshold.value
                    );
                    tracing::info!(
                        execution_id = execution.id,
                        threshold = %threshold.metric_type,
                        "Gate threshold not met, holding stage"
                    );
                    // Update stage history with gate reason
                    sqlx::query(
                        "UPDATE rollout_stage_history \
                         SET health_status = 'gated', gate_reason = $3 \
                         WHERE execution_id = $1 AND stage_order = $2 AND completed_at IS NULL",
                    )
                    .bind(execution.id)
                    .bind(execution.current_stage)
                    .bind(&reason)
                    .execute(db)
                    .await?;
                    return Ok(());
                }
                _ => {}
            }
        }
    }
    } // end if metrics.app_launches > 0

    // All thresholds pass (or no data to evaluate) — check if we can advance

    // Check minDevices
    if current_stage.min_devices > 0 && metrics.unique_devices < current_stage.min_devices as i64 {
        tracing::debug!(
            execution_id = execution.id,
            devices = metrics.unique_devices,
            required = current_stage.min_devices,
            "Not enough devices yet"
        );
        return Ok(());
    }

    // Check wait time (duration_minutes from when stage started)
    if current_stage.duration_minutes > 0 {
        let stage_started = sqlx::query_scalar::<_, Option<chrono::DateTime<chrono::Utc>>>(
            "SELECT started_at FROM rollout_stage_history \
             WHERE execution_id = $1 AND stage_order = $2 AND completed_at IS NULL \
             ORDER BY started_at DESC LIMIT 1",
        )
        .bind(execution.id)
        .bind(execution.current_stage)
        .fetch_one(db)
        .await?;

        if let Some(started) = stage_started {
            let elapsed = chrono::Utc::now() - started;
            if elapsed.num_minutes() < current_stage.duration_minutes as i64 {
                tracing::debug!(
                    execution_id = execution.id,
                    elapsed_min = elapsed.num_minutes(),
                    required_min = current_stage.duration_minutes,
                    "Wait time not elapsed"
                );
                return Ok(());
            }
        }
    }

    // All conditions met — advance to next stage
    tracing::info!(
        execution_id = execution.id,
        from_stage = execution.current_stage,
        "Auto-advancing execution"
    );
    advance_execution(db, events, execution, &stages).await?;

    Ok(())
}

/// Returns true if the threshold condition is satisfied (healthy).
fn evaluate_threshold(value: f64, operator: &str, threshold: f64) -> bool {
    match operator {
        "lt" => value < threshold,
        "lte" => value <= threshold,
        "gt" => value > threshold,
        "gte" => value >= threshold,
        "eq" => (value - threshold).abs() < f64::EPSILON,
        _ => true,
    }
}

struct EvalMetrics {
    crash_rate: f64,
    js_error_rate: f64,
    app_launches: i64,
    unique_devices: i64,
    /// Raw counts for custom metrics, keyed by event_name.
    custom: std::collections::HashMap<String, i64>,
}

async fn compute_metrics(
    db: &PgPool,
    execution: &RolloutExecution,
) -> Result<EvalMetrics, Box<dyn std::error::Error + Send + Sync>> {
    #[derive(sqlx::FromRow)]
    struct Row {
        event_type: String,
        total_count: Option<i64>,
    }

    let rows = sqlx::query_as::<_, Row>(
        "SELECT event_type, COALESCE(SUM(total_count), 0)::bigint AS total_count \
         FROM health_events_hourly \
         WHERE project_id = $1 AND channel_name = $2 AND bucket_hour >= $3 \
         GROUP BY event_type",
    )
    .bind(execution.project_id)
    .bind(&execution.channel)
    .bind(execution.started_at)
    .fetch_all(db)
    .await?;

    let mut crashes: i64 = 0;
    let mut js_errors: i64 = 0;
    let mut app_launches: i64 = 0;
    for row in &rows {
        let count = row.total_count.unwrap_or(0);
        match row.event_type.as_str() {
            "crash" => crashes += count,
            "js_error" => js_errors += count,
            "app_launch" => app_launches += count,
            _ => {}
        }
    }

    let denominator = if app_launches > 0 {
        app_launches as f64
    } else {
        1.0
    };

    let unique_devices = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT COALESCE(SUM(unique_devices), 0)::bigint FROM health_events_hourly \
         WHERE project_id = $1 AND channel_name = $2 AND bucket_hour >= $3",
    )
    .bind(execution.project_id)
    .bind(&execution.channel)
    .bind(execution.started_at)
    .fetch_one(db)
    .await?
    .unwrap_or(0);

    // Custom metrics: aggregate events where event_type = 'custom', grouped by event_name
    #[derive(sqlx::FromRow)]
    struct CustomRow {
        event_name: String,
        total_count: Option<i64>,
    }

    let custom_rows = sqlx::query_as::<_, CustomRow>(
        "SELECT event_name, COALESCE(SUM(total_count), 0)::bigint AS total_count \
         FROM health_events_hourly \
         WHERE project_id = $1 AND channel_name = $2 AND bucket_hour >= $3 \
         AND event_type = 'custom' AND event_name IS NOT NULL \
         GROUP BY event_name",
    )
    .bind(execution.project_id)
    .bind(&execution.channel)
    .bind(execution.started_at)
    .fetch_all(db)
    .await?;

    let mut custom = std::collections::HashMap::new();
    for row in custom_rows {
        custom.insert(row.event_name, row.total_count.unwrap_or(0));
    }

    Ok(EvalMetrics {
        crash_rate: crashes as f64 / denominator,
        js_error_rate: js_errors as f64 / denominator,
        app_launches,
        unique_devices,
        custom,
    })
}

async fn advance_execution(
    db: &PgPool,
    events: &ExecutionEventRegistry,
    execution: &RolloutExecution,
    stages: &[RolloutPolicyStage],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let next_stage = execution.current_stage + 1;

    // Complete current stage history
    sqlx::query(
        "UPDATE rollout_stage_history SET completed_at = NOW(), health_status = 'healthy' \
         WHERE execution_id = $1 AND stage_order = $2 AND completed_at IS NULL",
    )
    .bind(execution.id)
    .bind(execution.current_stage)
    .execute(db)
    .await?;

    if next_stage > stages.len() as i32 {
        complete_execution(db, events, execution).await?;
        return Ok(());
    }

    // Find next stage
    let target = stages
        .iter()
        .find(|s| s.stage_order == next_stage)
        .ok_or("Stage configuration mismatch")?;

    // Insert new stage history
    sqlx::query(
        "INSERT INTO rollout_stage_history (execution_id, stage_order, percentage) \
         VALUES ($1, $2, $3)",
    )
    .bind(execution.id)
    .bind(next_stage)
    .bind(target.percentage)
    .execute(db)
    .await?;

    // Update execution
    sqlx::query("UPDATE rollout_executions SET current_stage = $2 WHERE id = $1")
        .bind(execution.id)
        .bind(next_stage)
        .execute(db)
        .await?;

    // Update linked flags' targeting rules to the new stage percentage
    crate::handlers::rollout_executions::update_execution_targeting_rules(
        db,
        execution.id,
        target.percentage,
    )
    .await?;

    // Update release rollout percentage to match stage
    crate::handlers::rollout_executions::update_execution_rollout_percentage(
        db,
        execution,
        target.percentage,
    )
    .await?;

    events.emit(execution.id, ExecutionEvent::Updated);

    Ok(())
}

async fn complete_execution(
    db: &PgPool,
    events: &ExecutionEventRegistry,
    execution: &RolloutExecution,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Update release rollout percentage to 100%
    crate::handlers::rollout_executions::update_execution_rollout_percentage(
        db, execution, 100,
    )
    .await?;

    // Set each linked flag's default_value to match target_enabled so the flag
    // stays in the correct state after the targeting rule is removed.
    crate::handlers::rollout_executions::finalize_execution_flags(db, execution.id, &execution.channel)
        .await?;

    // Delete targeting rules — at 100% the flag is fully enabled, no rule needed
    crate::handlers::rollout_executions::delete_execution_targeting_rules(db, execution.id)
        .await?;

    sqlx::query(
        "UPDATE rollout_executions SET status = 'completed', completed_at = NOW() WHERE id = $1",
    )
    .bind(execution.id)
    .execute(db)
    .await?;
    tracing::info!(execution_id = execution.id, "Execution completed");
    events.emit(execution.id, ExecutionEvent::Updated);
    events.remove(execution.id);
    Ok(())
}

async fn rollback_execution(
    db: &PgPool,
    events: &ExecutionEventRegistry,
    execution: &RolloutExecution,
    reason: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Complete current stage with failed status
    sqlx::query(
        "UPDATE rollout_stage_history SET completed_at = NOW(), health_status = 'rolled_back', gate_reason = $3 \
         WHERE execution_id = $1 AND stage_order = $2 AND completed_at IS NULL",
    )
    .bind(execution.id)
    .bind(execution.current_stage)
    .bind(reason)
    .execute(db)
    .await?;

    // Mark execution as rolled back
    sqlx::query(
        "UPDATE rollout_executions \
         SET status = 'rolled_back', completed_at = NOW(), rollback_reason = $2 \
         WHERE id = $1",
    )
    .bind(execution.id)
    .bind(reason)
    .execute(db)
    .await?;

    // Delete targeting rules created by this execution
    crate::handlers::rollout_executions::delete_execution_targeting_rules(db, execution.id)
        .await?;

    // Phase 4: Restore linked flags to pre-execution state
    let restored = crate::handlers::rollout_executions::restore_pre_execution_flags(
        db,
        execution.id,
        &execution.channel,
        execution.project_id,
    )
    .await?;

    if !restored.is_empty() {
        tracing::info!(
            execution_id = execution.id,
            flags = ?restored,
            "Restored linked flags to pre-execution state on auto-rollback"
        );
    }

    tracing::warn!(execution_id = execution.id, reason, "Execution rolled back");
    events.emit(execution.id, ExecutionEvent::Updated);
    events.remove(execution.id);
    Ok(())
}
