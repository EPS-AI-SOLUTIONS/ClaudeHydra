//! Debug LiveView Module
//! Real-time debugging and monitoring for Claude GUI
//!
//! Features:
//! - System metrics (memory, CPU, tasks)
//! - IPC call tracking
//! - Ring buffer log storage
//! - Event streaming for live updates

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{command, AppHandle, Emitter};

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_LOG_ENTRIES: usize = 1000;
const MAX_IPC_HISTORY: usize = 100;
const STATS_EMIT_INTERVAL_MS: u64 = 500;

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Debug => write!(f, "DEBUG"),
            LogLevel::Info => write!(f, "INFO"),
            LogLevel::Warn => write!(f, "WARN"),
            LogLevel::Error => write!(f, "ERROR"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: u64,
    pub timestamp: u64,
    pub level: LogLevel,
    pub source: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcCall {
    pub id: u64,
    pub timestamp: u64,
    pub command: String,
    pub duration_ms: f64,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugStats {
    // Memory
    pub memory_used_mb: f64,
    pub memory_total_mb: f64,
    pub memory_percent: f64,

    // Tasks
    pub active_tasks: u32,
    pub queued_tasks: u32,
    pub completed_tasks: u64,

    // IPC
    pub ipc_calls_total: u64,
    pub ipc_calls_failed: u64,
    pub ipc_avg_latency_ms: f64,
    pub ipc_calls_per_sec: f64,

    // Events
    pub events_emitted: u64,
    pub events_per_sec: f64,

    // System
    pub uptime_secs: u64,
    pub cpu_cores: u32,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugSnapshot {
    pub stats: DebugStats,
    pub recent_logs: Vec<LogEntry>,
    pub recent_ipc: Vec<IpcCall>,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Global State
// ═══════════════════════════════════════════════════════════════════════════════

lazy_static::lazy_static! {
    static ref DEBUG_STATE: Arc<DebugState> = Arc::new(DebugState::new());
}

pub struct DebugState {
    // Logs
    logs: RwLock<VecDeque<LogEntry>>,
    log_counter: AtomicU64,

    // IPC tracking
    ipc_history: RwLock<VecDeque<IpcCall>>,
    #[allow(dead_code)]
    ipc_counter: AtomicU64,
    ipc_total: AtomicU64,
    ipc_failed: AtomicU64,
    ipc_total_latency_ms: RwLock<f64>,

    // Events
    events_emitted: AtomicU64,

    // Tasks
    active_tasks: AtomicU64,
    queued_tasks: AtomicU64,
    completed_tasks: AtomicU64,

    // Timing
    start_time: Instant,
    last_stats_time: RwLock<Instant>,
    last_ipc_count: AtomicU64,
    last_event_count: AtomicU64,

    // Streaming control
    streaming_active: RwLock<bool>,
}

impl DebugState {
    pub fn new() -> Self {
        Self {
            logs: RwLock::new(VecDeque::with_capacity(MAX_LOG_ENTRIES)),
            log_counter: AtomicU64::new(0),
            ipc_history: RwLock::new(VecDeque::with_capacity(MAX_IPC_HISTORY)),
            ipc_counter: AtomicU64::new(0),
            ipc_total: AtomicU64::new(0),
            ipc_failed: AtomicU64::new(0),
            ipc_total_latency_ms: RwLock::new(0.0),
            events_emitted: AtomicU64::new(0),
            active_tasks: AtomicU64::new(0),
            queued_tasks: AtomicU64::new(0),
            completed_tasks: AtomicU64::new(0),
            start_time: Instant::now(),
            last_stats_time: RwLock::new(Instant::now()),
            last_ipc_count: AtomicU64::new(0),
            last_event_count: AtomicU64::new(0),
            streaming_active: RwLock::new(false),
        }
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

impl Default for DebugState {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API - Logging
// ═══════════════════════════════════════════════════════════════════════════════

pub fn log(level: LogLevel, source: &str, message: &str) {
    log_with_details(level, source, message, None);
}

pub fn log_with_details(level: LogLevel, source: &str, message: &str, details: Option<String>) {
    let entry = LogEntry {
        id: DEBUG_STATE.log_counter.fetch_add(1, Ordering::SeqCst),
        timestamp: DebugState::now_ms(),
        level,
        source: source.to_string(),
        message: message.to_string(),
        details,
    };

    let mut logs = DEBUG_STATE.logs.write();
    if logs.len() >= MAX_LOG_ENTRIES {
        logs.pop_front();
    }
    logs.push_back(entry);
}

#[macro_export]
macro_rules! debug_log {
    ($level:expr, $source:expr, $($arg:tt)*) => {
        $crate::debug::log($level, $source, &format!($($arg)*))
    };
}

#[macro_export]
macro_rules! debug_info {
    ($source:expr, $($arg:tt)*) => {
        $crate::debug::log($crate::debug::LogLevel::Info, $source, &format!($($arg)*))
    };
}

#[macro_export]
macro_rules! debug_warn {
    ($source:expr, $($arg:tt)*) => {
        $crate::debug::log($crate::debug::LogLevel::Warn, $source, &format!($($arg)*))
    };
}

#[macro_export]
macro_rules! debug_error {
    ($source:expr, $($arg:tt)*) => {
        $crate::debug::log($crate::debug::LogLevel::Error, $source, &format!($($arg)*))
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API - IPC Tracking (reserved for future use)
// ═══════════════════════════════════════════════════════════════════════════════

#[allow(dead_code)]
pub fn track_ipc_start(command: &str) -> IpcTracker {
    DEBUG_STATE.active_tasks.fetch_add(1, Ordering::SeqCst);
    IpcTracker {
        command: command.to_string(),
        start: Instant::now(),
    }
}

#[allow(dead_code)]
pub struct IpcTracker {
    command: String,
    start: Instant,
}

#[allow(dead_code)]
impl IpcTracker {
    pub fn finish(self, success: bool, error: Option<String>) {
        let duration = self.start.elapsed();
        let duration_ms = duration.as_secs_f64() * 1000.0;

        DEBUG_STATE.active_tasks.fetch_sub(1, Ordering::SeqCst);
        DEBUG_STATE.completed_tasks.fetch_add(1, Ordering::SeqCst);
        DEBUG_STATE.ipc_total.fetch_add(1, Ordering::SeqCst);

        if !success {
            DEBUG_STATE.ipc_failed.fetch_add(1, Ordering::SeqCst);
        }

        {
            let mut latency = DEBUG_STATE.ipc_total_latency_ms.write();
            *latency += duration_ms;
        }

        let call = IpcCall {
            id: DEBUG_STATE.ipc_counter.fetch_add(1, Ordering::SeqCst),
            timestamp: DebugState::now_ms(),
            command: self.command,
            duration_ms,
            success,
            error,
        };

        let mut history = DEBUG_STATE.ipc_history.write();
        if history.len() >= MAX_IPC_HISTORY {
            history.pop_front();
        }
        history.push_back(call);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API - Task Tracking (reserved for future use)
// ═══════════════════════════════════════════════════════════════════════════════

#[allow(dead_code)]
pub fn task_queued() {
    DEBUG_STATE.queued_tasks.fetch_add(1, Ordering::SeqCst);
}

#[allow(dead_code)]
pub fn task_started() {
    DEBUG_STATE.queued_tasks.fetch_sub(1, Ordering::SeqCst);
    DEBUG_STATE.active_tasks.fetch_add(1, Ordering::SeqCst);
}

#[allow(dead_code)]
pub fn task_completed() {
    DEBUG_STATE.active_tasks.fetch_sub(1, Ordering::SeqCst);
    DEBUG_STATE.completed_tasks.fetch_add(1, Ordering::SeqCst);
}

pub fn event_emitted() {
    DEBUG_STATE.events_emitted.fetch_add(1, Ordering::SeqCst);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stats Collection
// ═══════════════════════════════════════════════════════════════════════════════

fn collect_stats() -> DebugStats {
    let now = Instant::now();
    let uptime = DEBUG_STATE.start_time.elapsed();

    // Calculate rates
    let elapsed_secs = {
        let last = DEBUG_STATE.last_stats_time.read();
        now.duration_since(*last).as_secs_f64().max(0.001)
    };

    let current_ipc = DEBUG_STATE.ipc_total.load(Ordering::SeqCst);
    let last_ipc = DEBUG_STATE.last_ipc_count.swap(current_ipc, Ordering::SeqCst);
    let ipc_per_sec = (current_ipc - last_ipc) as f64 / elapsed_secs;

    let current_events = DEBUG_STATE.events_emitted.load(Ordering::SeqCst);
    let last_events = DEBUG_STATE.last_event_count.swap(current_events, Ordering::SeqCst);
    let events_per_sec = (current_events - last_events) as f64 / elapsed_secs;

    // Calculate average latency
    let total_ipc = DEBUG_STATE.ipc_total.load(Ordering::SeqCst);
    let total_latency = *DEBUG_STATE.ipc_total_latency_ms.read();
    let avg_latency = if total_ipc > 0 {
        total_latency / total_ipc as f64
    } else {
        0.0
    };

    // Update timing
    {
        let mut last = DEBUG_STATE.last_stats_time.write();
        *last = now;
    }

    // Memory estimation (simplified - real implementation would use system APIs)
    let memory_used_mb = 64.0 + (DEBUG_STATE.logs.read().len() as f64 * 0.001);
    let memory_total_mb = 256.0;

    DebugStats {
        memory_used_mb,
        memory_total_mb,
        memory_percent: (memory_used_mb / memory_total_mb) * 100.0,
        active_tasks: DEBUG_STATE.active_tasks.load(Ordering::SeqCst) as u32,
        queued_tasks: DEBUG_STATE.queued_tasks.load(Ordering::SeqCst) as u32,
        completed_tasks: DEBUG_STATE.completed_tasks.load(Ordering::SeqCst),
        ipc_calls_total: total_ipc,
        ipc_calls_failed: DEBUG_STATE.ipc_failed.load(Ordering::SeqCst),
        ipc_avg_latency_ms: avg_latency,
        ipc_calls_per_sec: ipc_per_sec,
        events_emitted: current_events,
        events_per_sec,
        uptime_secs: uptime.as_secs(),
        cpu_cores: num_cpus::get() as u32,
        timestamp: DebugState::now_ms(),
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tauri Commands
// ═══════════════════════════════════════════════════════════════════════════════

#[command]
pub async fn debug_get_stats() -> Result<DebugStats, String> {
    Ok(collect_stats())
}

#[command]
pub async fn debug_get_logs(
    level: Option<String>,
    limit: Option<u32>,
    since_id: Option<u64>,
) -> Result<Vec<LogEntry>, String> {
    let limit = limit.unwrap_or(100) as usize;
    let level_filter: Option<LogLevel> = level.and_then(|l| match l.to_lowercase().as_str() {
        "debug" => Some(LogLevel::Debug),
        "info" => Some(LogLevel::Info),
        "warn" => Some(LogLevel::Warn),
        "error" => Some(LogLevel::Error),
        _ => None,
    });

    let logs = DEBUG_STATE.logs.read();
    let filtered: Vec<LogEntry> = logs
        .iter()
        .filter(|entry| {
            // Filter by level
            if let Some(ref filter) = level_filter {
                if entry.level != *filter {
                    return false;
                }
            }
            // Filter by ID (for incremental updates)
            if let Some(id) = since_id {
                if entry.id <= id {
                    return false;
                }
            }
            true
        })
        .rev()
        .take(limit)
        .cloned()
        .collect();

    Ok(filtered)
}

#[command]
pub async fn debug_get_ipc_history(limit: Option<u32>) -> Result<Vec<IpcCall>, String> {
    let limit = limit.unwrap_or(50) as usize;
    let history = DEBUG_STATE.ipc_history.read();
    let result: Vec<IpcCall> = history.iter().rev().take(limit).cloned().collect();
    Ok(result)
}

#[command]
pub async fn debug_get_snapshot() -> Result<DebugSnapshot, String> {
    let stats = collect_stats();
    let logs = DEBUG_STATE.logs.read();
    let ipc = DEBUG_STATE.ipc_history.read();

    Ok(DebugSnapshot {
        stats,
        recent_logs: logs.iter().rev().take(50).cloned().collect(),
        recent_ipc: ipc.iter().rev().take(20).cloned().collect(),
    })
}

#[command]
pub async fn debug_clear_logs() -> Result<(), String> {
    DEBUG_STATE.logs.write().clear();
    log(LogLevel::Info, "Debug", "Logs cleared");
    Ok(())
}

#[command]
pub async fn debug_add_log(
    level: String,
    source: String,
    message: String,
    details: Option<String>,
) -> Result<(), String> {
    let log_level = match level.to_lowercase().as_str() {
        "debug" => LogLevel::Debug,
        "info" => LogLevel::Info,
        "warn" => LogLevel::Warn,
        "error" => LogLevel::Error,
        _ => LogLevel::Info,
    };
    log_with_details(log_level, &source, &message, details);
    Ok(())
}

#[command]
pub async fn debug_start_streaming(app: AppHandle) -> Result<(), String> {
    {
        let mut active = DEBUG_STATE.streaming_active.write();
        if *active {
            return Ok(()); // Already streaming
        }
        *active = true;
    }

    log(LogLevel::Info, "Debug", "LiveView streaming started");

    tokio::spawn(async move {
        loop {
            // Check if still active
            {
                let active = DEBUG_STATE.streaming_active.read();
                if !*active {
                    break;
                }
            }

            // Emit stats
            let stats = collect_stats();
            let _ = app.emit("debug-stats", &stats);
            event_emitted();

            tokio::time::sleep(Duration::from_millis(STATS_EMIT_INTERVAL_MS)).await;
        }
        log(LogLevel::Info, "Debug", "LiveView streaming stopped");
    });

    Ok(())
}

#[command]
pub async fn debug_stop_streaming() -> Result<(), String> {
    let mut active = DEBUG_STATE.streaming_active.write();
    *active = false;
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════════

pub fn init() {
    log(LogLevel::Info, "Debug", "Debug module initialized");
    log(
        LogLevel::Info,
        "System",
        &format!("CPU cores: {}", num_cpus::get()),
    );
}
