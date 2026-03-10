use sqlx::PgPool;

/// Spawn the background aggregation task. Call once from main().
pub fn spawn_aggregator(db: PgPool) {
    tokio::spawn(async move {
        // Stagger start: wait 30s after server boot to avoid thundering herd
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(120));
        loop {
            interval.tick().await;
            if let Err(e) = run_aggregation_cycle(&db).await {
                tracing::error!(error = %e, "Aggregation cycle failed");
            }
        }
    });
}

/// Run a single aggregation cycle. This is the testable core function.
///
/// For each project with recent raw data (last 10 minutes):
/// 1. Aggregate hourly counts from raw events
/// 2. Detect anomalies from hourly data
/// 3. Update daily stats
/// 4. Update flag health snapshots (single aggregated query)
/// 5. Aggregate performance percentiles (p50, p95, p99)
/// 6. Record aggregation run metadata
pub async fn run_aggregation_cycle(
    db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let start = std::time::Instant::now();

    // Get all projects with recent health data (10-minute window for safety overlap)
    let project_ids: Vec<i64> = sqlx::query_scalar(
        "SELECT DISTINCT project_id FROM health_events_raw \
         WHERE received_at > NOW() - INTERVAL '10 minutes'",
    )
    .fetch_all(db)
    .await?;

    // Also get projects with recent performance data
    let perf_project_ids: Vec<i64> = sqlx::query_scalar(
        "SELECT DISTINCT project_id FROM performance_samples \
         WHERE received_at > NOW() - INTERVAL '10 minutes'",
    )
    .fetch_all(db)
    .await?;

    // Merge both lists (dedup)
    let mut all_project_ids = project_ids.clone();
    for pid in &perf_project_ids {
        if !all_project_ids.contains(pid) {
            all_project_ids.push(*pid);
        }
    }

    for &project_id in &all_project_ids {
        // Wrap each project in a try/catch so one failure doesn't block others
        if let Err(e) = process_project(db, project_id).await {
            tracing::error!(
                error = %e,
                project_id = project_id,
                "Failed to aggregate project"
            );
        }
    }

    // Record aggregation run
    sqlx::query(
        "INSERT INTO aggregation_runs (completed_at, duration_ms, projects_processed) \
         VALUES (NOW(), $1, $2)",
    )
    .bind(start.elapsed().as_millis() as i64)
    .bind(all_project_ids.len() as i32)
    .execute(db)
    .await?;

    tracing::info!(
        duration_ms = start.elapsed().as_millis() as u64,
        projects = all_project_ids.len(),
        "Aggregation cycle complete"
    );

    Ok(())
}

async fn process_project(
    db: &PgPool,
    project_id: i64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    aggregate_hourly(db, project_id).await?;
    detect_anomalies(db, project_id).await?;
    update_daily_stats(db, project_id).await?;
    update_flag_health_snapshots(db, project_id).await?;
    aggregate_performance_percentiles(db, project_id).await?;
    Ok(())
}

/// Upsert hourly aggregates from recent raw events using SQL-level aggregation.
async fn aggregate_hourly(
    db: &PgPool,
    project_id: i64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Aggregate raw events into hourly buckets in a single SQL operation.
    // Uses date_trunc to bucket timestamps, groups by all dimensions,
    // and upserts with ON CONFLICT to be idempotent.
    sqlx::query(
        "INSERT INTO health_events_hourly \
         (project_id, bucket_hour, channel_name, platform, runtime_version, \
          update_uuid, event_type, event_name, total_count, unique_devices) \
         SELECT \
            project_id, \
            date_trunc('hour', received_at) AS bucket_hour, \
            channel_name, \
            platform, \
            runtime_version, \
            COALESCE(update_uuid, '') AS update_uuid, \
            event_type, \
            event_name, \
            SUM(count)::BIGINT AS total_count, \
            COUNT(DISTINCT device_id)::INT AS unique_devices \
         FROM health_events_raw \
         WHERE project_id = $1 AND received_at > NOW() - INTERVAL '10 minutes' \
         GROUP BY project_id, date_trunc('hour', received_at), channel_name, platform, \
                  runtime_version, COALESCE(update_uuid, ''), event_type, event_name \
         ON CONFLICT (project_id, bucket_hour, channel_name, platform, \
                      runtime_version, update_uuid, event_type, event_name) \
         DO UPDATE SET total_count = EXCLUDED.total_count, \
           unique_devices = EXCLUDED.unique_devices",
    )
    .bind(project_id)
    .execute(db)
    .await?;

    Ok(())
}

/// Detect anomalies by comparing current-hour error counts against 24h average.
async fn detect_anomalies(
    db: &PgPool,
    project_id: i64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use chrono::Timelike;
    let now = chrono::Utc::now();
    let bucket_hour = now
        .date_naive()
        .and_hms_opt(now.time().hour(), 0, 0)
        .unwrap()
        .and_utc();

    // Get distinct channels for this project in the current hour
    let channels: Vec<Option<String>> = sqlx::query_scalar(
        "SELECT DISTINCT channel_name FROM health_events_hourly \
         WHERE project_id = $1 AND bucket_hour = $2",
    )
    .bind(project_id)
    .bind(bucket_hour)
    .fetch_all(db)
    .await?;

    for channel in &channels {
        let error_count = sqlx::query_scalar::<_, Option<i64>>(
            "SELECT SUM(total_count)::BIGINT FROM health_events_hourly \
             WHERE project_id = $1 AND event_type IN ('js_error', 'crash') \
             AND bucket_hour = $2 AND channel_name IS NOT DISTINCT FROM $3",
        )
        .bind(project_id)
        .bind(bucket_hour)
        .bind(channel)
        .fetch_one(db)
        .await?;

        if let Some(current) = error_count {
            if current > 5 {
                let avg_24h = sqlx::query_scalar::<_, Option<f64>>(
                    "SELECT AVG(total_count)::DOUBLE PRECISION FROM health_events_hourly \
                     WHERE project_id = $1 AND event_type IN ('js_error', 'crash') \
                     AND bucket_hour >= $2 AND bucket_hour < $3 \
                     AND channel_name IS NOT DISTINCT FROM $4",
                )
                .bind(project_id)
                .bind(bucket_hour - chrono::Duration::hours(24))
                .bind(bucket_hour)
                .bind(channel)
                .fetch_one(db)
                .await?;

                if let Some(avg) = avg_24h {
                    if avg > 0.0 && (current as f64) > avg * 2.0 {
                        try_insert_anomaly(
                            db,
                            project_id,
                            channel.as_deref(),
                            current,
                            avg,
                            bucket_hour,
                        )
                        .await
                        .ok(); // Best-effort
                    }
                }
            }
        }
    }

    Ok(())
}

/// Best-effort anomaly insertion into telemetry_events.
async fn try_insert_anomaly(
    db: &PgPool,
    project_id: i64,
    channel: Option<&str>,
    current_count: i64,
    avg_count: f64,
    bucket_hour: chrono::DateTime<chrono::Utc>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Deduplicate: don't insert if we already have an anomaly for this hour+channel
    let existing = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM telemetry_events \
         WHERE project_id = $1 AND event_type = 'error_spike' \
         AND created_at >= $2 AND created_at < $3)",
    )
    .bind(project_id)
    .bind(bucket_hour)
    .bind(bucket_hour + chrono::Duration::hours(1))
    .fetch_one(db)
    .await?;

    if existing {
        return Ok(());
    }

    // Try to find the most common flag key in recent error events
    let correlated_flag = sqlx::query_as::<_, (String, String)>(
        "SELECT key, value::TEXT FROM health_events_raw, \
         jsonb_each(flag_states) \
         WHERE project_id = $1 AND event_type IN ('js_error', 'crash') \
         AND received_at >= $2 AND flag_states IS NOT NULL \
         GROUP BY key, value ORDER BY COUNT(*) DESC LIMIT 1",
    )
    .bind(project_id)
    .bind(bucket_hour)
    .fetch_optional(db)
    .await?;

    let (linked_flag_id, linked_variation) = if let Some((flag_key, variation)) = correlated_flag {
        let flag_id = sqlx::query_scalar::<_, i64>(
            "SELECT id FROM feature_flags WHERE project_id = $1 AND key = $2",
        )
        .bind(project_id)
        .bind(&flag_key)
        .fetch_optional(db)
        .await?;
        (flag_id, Some(variation))
    } else {
        (None, None)
    };

    let ratio = (current_count as f64 / avg_count) as i32;
    let severity = if current_count as f64 > avg_count * 5.0 {
        "critical"
    } else {
        "warning"
    };
    let status = if current_count as f64 > avg_count * 5.0 {
        "incident"
    } else {
        "degraded"
    };
    let channel_label = channel.unwrap_or("default");

    sqlx::query(
        "INSERT INTO telemetry_events \
         (project_id, event_type, severity, status, title, description, \
          linked_flag_id, linked_flag_variation, affected_devices) \
         VALUES ($1, 'error_spike', $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(project_id)
    .bind(severity)
    .bind(status)
    .bind(format!("Error spike on {channel_label} channel"))
    .bind(format!(
        "Error rate is {ratio}x above 24h average ({current_count} errors this hour vs avg {:.0})",
        avg_count
    ))
    .bind(linked_flag_id)
    .bind(&linked_variation)
    .bind(1i32)
    .execute(db)
    .await?;

    Ok(())
}

/// Upsert daily stats from hourly aggregates.
async fn update_daily_stats(
    db: &PgPool,
    project_id: i64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let today = chrono::Utc::now().date_naive();

    // Compute totals from hourly data for today
    #[derive(sqlx::FromRow)]
    struct DailyRow {
        channel_name: Option<String>,
        event_type: String,
        total: Option<i64>,
    }

    let rows = sqlx::query_as::<_, DailyRow>(
        "SELECT channel_name, event_type, SUM(total_count)::BIGINT as total \
         FROM health_events_hourly \
         WHERE project_id = $1 AND bucket_hour::date = $2 \
         GROUP BY channel_name, event_type",
    )
    .bind(project_id)
    .bind(today)
    .fetch_all(db)
    .await?;

    // Aggregate by channel
    let mut channel_stats: std::collections::HashMap<Option<String>, (i64, i64)> =
        std::collections::HashMap::new();
    for row in &rows {
        let total = row.total.unwrap_or(0);
        let entry = channel_stats
            .entry(row.channel_name.clone())
            .or_insert((0, 0));
        match row.event_type.as_str() {
            "js_error" | "crash" => entry.0 += total,
            "app_launch" => entry.1 += total,
            _ => {}
        }
    }

    for (channel, (errors, launches)) in &channel_stats {
        if *launches > 0 || *errors > 0 {
            sqlx::query(
                "INSERT INTO telemetry_daily_stats \
                 (project_id, date, channel_name, total_errors, total_launches, \
                  error_rate, crash_free, flag_evals, update_installs) \
                 VALUES ($1, $2, $3, $4, $5, \
                  CASE WHEN $5 > 0 THEN ($4::float / $5::float) * 100 ELSE 0 END, \
                  CASE WHEN $5 > 0 THEN 100 - ($4::float / $5::float) * 100 ELSE 100 END, \
                  0, 0) \
                 ON CONFLICT (project_id, date, channel_name) \
                 DO UPDATE SET \
                   total_errors = EXCLUDED.total_errors, \
                   total_launches = EXCLUDED.total_launches, \
                   error_rate = EXCLUDED.error_rate, \
                   crash_free = EXCLUDED.crash_free",
            )
            .bind(project_id)
            .bind(today)
            .bind(channel)
            .bind(*errors)
            .bind(*launches)
            .execute(db)
            .await?;
        }
    }

    Ok(())
}

/// Update flag health snapshots using a single aggregated SQL query.
/// This replaces the N+1 loop with a single pass over health_events_raw.
async fn update_flag_health_snapshots(
    db: &PgPool,
    project_id: i64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Single aggregated query: extracts flag states from raw events,
    // computes per-flag per-variation stats in one pass
    #[derive(sqlx::FromRow)]
    struct FlagStatRow {
        flag_id: i64,
        flag_key: String,
        flag_value: String,
        channel_name: Option<String>,
        launches: Option<i64>,
        js_errors: Option<i64>,
        crashes: Option<i64>,
        devices: Option<i64>,
        variation_id: Option<i64>,
    }

    let stats = sqlx::query_as::<_, FlagStatRow>(
        "WITH flag_events AS ( \
            SELECT \
                r.event_type, \
                r.device_id, \
                r.channel_name, \
                (kv).key AS flag_key, \
                (kv).value::text AS flag_value \
            FROM health_events_raw r, \
                 LATERAL jsonb_each(r.flag_states) AS kv \
            WHERE r.project_id = $1 \
              AND r.received_at >= NOW() - INTERVAL '24 hours' \
              AND r.flag_states IS NOT NULL \
        ), \
        flag_stats AS ( \
            SELECT \
                flag_key, \
                flag_value, \
                channel_name, \
                COUNT(*) FILTER (WHERE event_type = 'app_launch') AS launches, \
                COUNT(*) FILTER (WHERE event_type = 'js_error') AS js_errors, \
                COUNT(*) FILTER (WHERE event_type = 'crash') AS crashes, \
                COUNT(DISTINCT device_id) AS devices \
            FROM flag_events \
            GROUP BY flag_key, flag_value, channel_name \
        ) \
        SELECT \
            f.id AS flag_id, \
            fs.flag_key, \
            fs.flag_value, \
            fs.channel_name, \
            fs.launches, \
            fs.js_errors, \
            fs.crashes, \
            fs.devices, \
            fv.id AS variation_id \
        FROM flag_stats fs \
        JOIN feature_flags f ON f.key = fs.flag_key AND f.project_id = $1 AND f.enabled = true \
        LEFT JOIN flag_variations fv ON fv.flag_id = f.id AND fv.value = fs.flag_value::jsonb \
        WHERE fs.launches > 0",
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;

    for row in &stats {
        let launches = row.launches.unwrap_or(0);
        let js_errors = row.js_errors.unwrap_or(0);
        let crashes = row.crashes.unwrap_or(0);
        let devices = row.devices.unwrap_or(0);

        if launches == 0 {
            continue;
        }

        let error_rate_raw =
            (js_errors + crashes) as f64 / launches as f64 * 100.0;
        let error_rate = (error_rate_raw.min(100.0) * 100.0).round() / 100.0;
        let crash_rate_raw = crashes as f64 / launches as f64 * 100.0;
        let crash_free =
            ((100.0 - crash_rate_raw).max(0.0).min(100.0) * 100.0).round() / 100.0;

        let channel_str = row.channel_name.as_deref().unwrap_or("default");

        // Get previous error rate for delta
        let prev_error_rate = sqlx::query_scalar::<_, Option<f64>>(
            "SELECT error_rate FROM flag_health_snapshots \
             WHERE flag_id = $1 AND channel_name = $2 \
             AND variation_id IS NOT DISTINCT FROM $3 \
             ORDER BY recorded_at DESC LIMIT 1",
        )
        .bind(row.flag_id)
        .bind(channel_str)
        .bind(row.variation_id)
        .fetch_one(db)
        .await
        .unwrap_or(None);

        let error_rate_delta = prev_error_rate
            .map(|prev| ((error_rate - prev) * 100.0).round() / 100.0)
            .unwrap_or(0.0);

        let status = if error_rate > 10.0 {
            "incident"
        } else if error_rate > 2.0 {
            "degraded"
        } else {
            "healthy"
        };

        // Look up runtime_version from a recent raw event for this project
        let runtime_version: String = sqlx::query_scalar(
            "SELECT runtime_version FROM health_events_raw \
             WHERE project_id = $1 ORDER BY received_at DESC LIMIT 1",
        )
        .bind(project_id)
        .fetch_optional(db)
        .await?
        .unwrap_or_else(|| "unknown".to_string());

        sqlx::query(
            "INSERT INTO flag_health_snapshots \
             (flag_id, variation_id, channel_name, runtime_version, devices, \
              error_rate, error_rate_delta, crash_free, status) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(row.flag_id)
        .bind(row.variation_id)
        .bind(channel_str)
        .bind(&runtime_version)
        .bind(devices as i32)
        .bind(error_rate)
        .bind(error_rate_delta)
        .bind(crash_free)
        .bind(status)
        .execute(db)
        .await?;
    }

    Ok(())
}

/// Compute performance percentiles (p50, p95, p99) from raw performance samples
/// and upsert into perf_hourly_aggregates.
async fn aggregate_performance_percentiles(
    db: &PgPool,
    project_id: i64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use chrono::Timelike;
    let now = chrono::Utc::now();
    let bucket_hour = now
        .date_naive()
        .and_hms_opt(now.time().hour(), 0, 0)
        .unwrap()
        .and_utc();

    #[derive(sqlx::FromRow)]
    struct PerfRow {
        metric_name: String,
        channel_name: Option<String>,
        platform: Option<String>,
        runtime_version: Option<String>,
        sample_count: Option<i64>,
        p50: Option<f64>,
        p95: Option<f64>,
        p99: Option<f64>,
    }

    let rows = sqlx::query_as::<_, PerfRow>(
        "SELECT \
            metric_name, \
            channel_name, \
            platform, \
            runtime_version, \
            COUNT(*)::BIGINT AS sample_count, \
            percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50, \
            percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95, \
            percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99 \
         FROM performance_samples \
         WHERE project_id = $1 \
           AND received_at > NOW() - INTERVAL '1 hour' \
         GROUP BY metric_name, channel_name, platform, runtime_version",
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;

    for row in &rows {
        sqlx::query(
            "INSERT INTO perf_hourly_aggregates \
             (project_id, bucket_hour, channel_name, platform, runtime_version, \
              metric_name, sample_count, p50, p95, p99) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) \
             ON CONFLICT (project_id, bucket_hour, channel_name, platform, runtime_version, metric_name) \
             DO UPDATE SET \
               sample_count = EXCLUDED.sample_count, \
               p50 = EXCLUDED.p50, \
               p95 = EXCLUDED.p95, \
               p99 = EXCLUDED.p99",
        )
        .bind(project_id)
        .bind(bucket_hour)
        .bind(&row.channel_name)
        .bind(&row.platform)
        .bind(&row.runtime_version)
        .bind(&row.metric_name)
        .bind(row.sample_count.unwrap_or(0) as i32)
        .bind(row.p50.unwrap_or(0.0))
        .bind(row.p95.unwrap_or(0.0))
        .bind(row.p99.unwrap_or(0.0))
        .execute(db)
        .await?;
    }

    Ok(())
}
