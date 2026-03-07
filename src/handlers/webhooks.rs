use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

const MAX_ATTEMPTS: i32 = 3;

/// Fire webhooks matching the given event. Records a delivery row per webhook,
/// then spawns background tasks to POST with up to 3 retry attempts.
pub async fn fire_webhooks(db: &sqlx::PgPool, event: &str, payload: serde_json::Value) {
    let webhooks = sqlx::query_as::<_, crate::models::WebhookConfig>(
        "SELECT * FROM webhook_configs WHERE is_active = TRUE AND $1 = ANY(events) AND project_id IS NOT NULL",
    )
    .bind(event)
    .fetch_all(db)
    .await;

    let webhooks = match webhooks {
        Ok(w) => w,
        Err(e) => {
            tracing::error!("Failed to load webhooks: {e}");
            return;
        }
    };

    if webhooks.is_empty() {
        return;
    }

    let body = serde_json::json!({
        "event": event,
        "data": payload,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });

    for wh in webhooks {
        // Insert a delivery record
        let delivery_id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO webhook_deliveries (webhook_id, event, payload, max_attempts)
             VALUES ($1, $2, $3, $4) RETURNING id",
        )
        .bind(wh.id)
        .bind(event)
        .bind(&body)
        .bind(MAX_ATTEMPTS)
        .fetch_one(db)
        .await;

        let delivery_id = match delivery_id {
            Ok(id) => id,
            Err(e) => {
                tracing::error!("Failed to create webhook delivery record: {e}");
                continue;
            }
        };

        let db = db.clone();
        let url = wh.url.clone();
        let secret = wh.secret.clone();
        let body_str = serde_json::to_string(&body).unwrap_or_default();

        tokio::spawn(async move {
            deliver_webhook(&db, delivery_id, &url, &secret, &body_str).await;
        });
    }
}

/// Attempt delivery with exponential backoff retries.
async fn deliver_webhook(
    db: &sqlx::PgPool,
    delivery_id: i64,
    url: &str,
    secret: &Option<String>,
    body_str: &str,
) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap();

    for attempt in 1..=MAX_ATTEMPTS {
        // Update attempt counter
        let _ = sqlx::query(
            "UPDATE webhook_deliveries SET attempt = $2, status = 'pending' WHERE id = $1",
        )
        .bind(delivery_id)
        .bind(attempt)
        .execute(db)
        .await;

        let mut request = client
            .post(url)
            .header("content-type", "application/json")
            .header("user-agent", "dispatch-ota/0.1");

        if let Some(secret) = secret {
            if let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) {
                mac.update(body_str.as_bytes());
                let sig = hex::encode(mac.finalize().into_bytes());
                request = request.header("x-dispatch-signature", format!("sha256={sig}"));
            }
        }

        match request.body(body_str.to_owned()).send().await {
            Ok(resp) => {
                let status = resp.status().as_u16() as i32;
                let resp_body = resp
                    .text()
                    .await
                    .unwrap_or_default()
                    .chars()
                    .take(4096)
                    .collect::<String>();

                if (200..300).contains(&status) {
                    let _ = sqlx::query(
                        "UPDATE webhook_deliveries
                         SET status = 'success', http_status = $2, response_body = $3, completed_at = NOW()
                         WHERE id = $1",
                    )
                    .bind(delivery_id)
                    .bind(status)
                    .bind(&resp_body)
                    .execute(db)
                    .await;

                    tracing::info!("Webhook delivered to {url} — status {status}");
                    return;
                }

                // Non-2xx — record and maybe retry
                let error_msg = format!("HTTP {status}");
                record_attempt_failure(db, delivery_id, attempt, Some(status), &resp_body, &error_msg).await;
                tracing::warn!("Webhook to {url} returned {status} (attempt {attempt}/{MAX_ATTEMPTS})");
            }
            Err(e) => {
                let error_msg = e.to_string();
                record_attempt_failure(db, delivery_id, attempt, None, "", &error_msg).await;
                tracing::warn!("Webhook to {url} failed: {error_msg} (attempt {attempt}/{MAX_ATTEMPTS})");
            }
        }

        if attempt < MAX_ATTEMPTS {
            // Exponential backoff: 5s, 25s
            let delay_secs = 5u64.pow(attempt as u32);
            let next_retry = chrono::Utc::now() + chrono::Duration::seconds(delay_secs as i64);
            let _ = sqlx::query(
                "UPDATE webhook_deliveries SET next_retry_at = $2 WHERE id = $1",
            )
            .bind(delivery_id)
            .bind(next_retry)
            .execute(db)
            .await;

            tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
        }
    }

    // All attempts exhausted
    let _ = sqlx::query(
        "UPDATE webhook_deliveries SET status = 'failed', completed_at = NOW() WHERE id = $1",
    )
    .bind(delivery_id)
    .execute(db)
    .await;

    tracing::error!("Webhook delivery {delivery_id} to {url} permanently failed after {MAX_ATTEMPTS} attempts");
}

async fn record_attempt_failure(
    db: &sqlx::PgPool,
    delivery_id: i64,
    attempt: i32,
    http_status: Option<i32>,
    response_body: &str,
    error_message: &str,
) {
    let status = if attempt >= MAX_ATTEMPTS { "failed" } else { "pending" };
    let _ = sqlx::query(
        "UPDATE webhook_deliveries
         SET status = $2, http_status = $3, response_body = $4, error_message = $5
         WHERE id = $1",
    )
    .bind(delivery_id)
    .bind(status)
    .bind(http_status)
    .bind(response_body)
    .bind(error_message)
    .execute(db)
    .await;
}
