//! Broadcast registry for SSE-based flag evaluation updates.
//!
//! Each connected SDK client subscribes with a connection key of
//! (project_id, channel, targeting_key). When a flag changes, the
//! server re-evaluates it for each connected context and pushes
//! the result via the broadcast channel.

use dashmap::DashMap;
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::broadcast;

/// Events pushed to SSE clients watching flag changes.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FlagEvent {
    /// Full state: all evaluated flags for this context (sent on connect).
    Put { flags: serde_json::Value },
    /// Single flag changed: re-evaluated for this context.
    Patch { key: String, flag: serde_json::Value },
    /// Flag deleted.
    Delete { key: String },
}

/// Connection key: (project_id, channel, targeting_key).
pub type ConnKey = (i64, String, String);

/// Shared registry of per-context broadcast channels for flag SSE streaming.
#[derive(Clone, Default)]
pub struct FlagEventRegistry {
    channels: Arc<DashMap<ConnKey, broadcast::Sender<FlagEvent>>>,
}

impl FlagEventRegistry {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(DashMap::new()),
        }
    }

    /// Subscribe to flag events for a given connection context.
    /// Creates the channel on first subscribe. Buffer size 64 to handle
    /// burst flag updates.
    pub fn subscribe(&self, key: ConnKey) -> broadcast::Receiver<FlagEvent> {
        let entry = self
            .channels
            .entry(key)
            .or_insert_with(|| broadcast::channel(64).0);
        entry.subscribe()
    }

    /// Remove a channel entry. Call when a client disconnects.
    pub fn remove(&self, key: &ConnKey) {
        self.channels.remove(key);
    }

    /// Emit an event to all subscribers of the given connection context.
    /// No-op if nobody is listening.
    pub fn emit(&self, key: &ConnKey, event: FlagEvent) {
        if let Some(tx) = self.channels.get(key) {
            // Ignore send errors (no active receivers)
            let _ = tx.send(event);
        }
    }

    /// Returns all connected contexts matching the given project_id AND channel.
    /// Used to push flag changes to all devices on a specific channel.
    pub fn iter_contexts_for_project_channel(
        &self,
        project_id: i64,
        channel: &str,
    ) -> Vec<ConnKey> {
        self.channels
            .iter()
            .filter(|entry| entry.key().0 == project_id && entry.key().1 == channel)
            .map(|entry| entry.key().clone())
            .collect()
    }

    /// Returns ALL connected contexts for a project across ALL channels.
    /// Needed for cross-channel notifications (e.g., flag deletion affects all channels).
    pub fn iter_contexts_for_project(&self, project_id: i64) -> Vec<ConnKey> {
        self.channels
            .iter()
            .filter(|entry| entry.key().0 == project_id)
            .map(|entry| entry.key().clone())
            .collect()
    }
}
