//! Lightweight broadcast registry for SSE-based execution updates.

use dashmap::DashMap;
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::broadcast;

/// Event pushed to SSE clients watching an execution.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ExecutionEvent {
    /// Full execution detail refresh (status, stage, flags, etc.)
    Updated,
}

/// Shared registry of per-execution broadcast channels.
#[derive(Clone, Default)]
pub struct ExecutionEventRegistry {
    channels: Arc<DashMap<i64, broadcast::Sender<ExecutionEvent>>>,
}

impl ExecutionEventRegistry {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(DashMap::new()),
        }
    }

    /// Subscribe to events for a given execution. Creates the channel on first subscribe.
    pub fn subscribe(&self, execution_id: i64) -> broadcast::Receiver<ExecutionEvent> {
        let entry = self
            .channels
            .entry(execution_id)
            .or_insert_with(|| broadcast::channel(16).0);
        entry.subscribe()
    }

    /// Emit an event to all subscribers of the given execution.
    /// No-op if nobody is listening.
    pub fn emit(&self, execution_id: i64, event: ExecutionEvent) {
        if let Some(tx) = self.channels.get(&execution_id) {
            // Ignore send errors (no active receivers)
            let _ = tx.send(event);
        }
    }

    /// Remove a channel entry. Call when an execution reaches a terminal state
    /// and no further events will be emitted.
    pub fn remove(&self, execution_id: i64) {
        self.channels.remove(&execution_id);
    }
}
