//! Stale run detector for long-running fuzz campaigns.
//!
//! A run is considered stale when no progress has been recorded within the
//! configured threshold. Progress is defined as either a new unique crash
//! signature being discovered or the seeds-processed counter advancing.
//!
//! ## Usage
//! ```rust
//! use crashlab_core::stale_detector::{StaleDetectorConfig, StaleRunDetector, StaleStatus};
//!
//! let cfg = StaleDetectorConfig::new(30_000); // 30 s threshold
//! let mut detector = StaleRunDetector::new(cfg);
//!
//! // Call record_progress() whenever the run makes forward progress.
//! detector.record_progress();
//!
//! // Poll check() periodically; act when Stale is returned.
//! match detector.check() {
//!     StaleStatus::Ok => {}
//!     StaleStatus::Stale { stale_ms, hint } => {
//!         eprintln!("Run stale for {stale_ms} ms — {hint}");
//!     }
//! }
//! ```

use std::time::{Duration, Instant};

/// Configuration for the stale run detector.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StaleDetectorConfig {
    /// Milliseconds without progress before a run is marked stale.
    pub stale_threshold_ms: u64,
}

impl StaleDetectorConfig {
    pub const fn new(stale_threshold_ms: u64) -> Self {
        Self { stale_threshold_ms }
    }
}

impl Default for StaleDetectorConfig {
    /// Default threshold: 60 seconds.
    fn default() -> Self {
        Self::new(60_000)
    }
}

/// Result of a staleness check.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StaleStatus {
    /// The run is making progress within the configured threshold.
    Ok,
    /// No progress has been recorded for `stale_ms` milliseconds.
    Stale {
        /// How long (ms) the run has been without progress.
        stale_ms: u64,
        /// Human-readable recovery hint surfaced to operators.
        hint: String,
    },
}

/// Detects and marks runs that stop producing progress for too long.
pub struct StaleRunDetector {
    config: StaleDetectorConfig,
    last_progress: Instant,
}

impl StaleRunDetector {
    /// Creates a new detector; the progress clock starts immediately.
    pub fn new(config: StaleDetectorConfig) -> Self {
        Self {
            config,
            last_progress: Instant::now(),
        }
    }

    /// Records a progress event, resetting the stale clock.
    ///
    /// Call this whenever a new unique crash signature is found or the
    /// seeds-processed counter advances.
    pub fn record_progress(&mut self) {
        self.last_progress = Instant::now();
    }

    /// Returns [`StaleStatus::Stale`] when no progress has been recorded within
    /// the configured threshold, otherwise [`StaleStatus::Ok`].
    pub fn check(&self) -> StaleStatus {
        self.check_with_elapsed(self.last_progress.elapsed())
    }

    /// Evaluates staleness for an explicit elapsed duration.
    ///
    /// This keeps tests reproducible without relying on thread sleeps and lets
    /// callers verify retention/health behavior deterministically.
    pub fn check_with_elapsed(&self, elapsed: Duration) -> StaleStatus {
        let threshold = Duration::from_millis(self.config.stale_threshold_ms);

        if elapsed >= threshold {
            let stale_ms = elapsed.as_millis() as u64;
            StaleStatus::Stale {
                stale_ms,
                hint: recovery_hint(stale_ms),
            }
        } else {
            StaleStatus::Ok
        }
    }

    /// Milliseconds elapsed since the last recorded progress event.
    pub fn elapsed_since_progress_ms(&self) -> u64 {
        self.last_progress.elapsed().as_millis() as u64
    }
}

/// Produces a recovery hint based on how long the run has been stale.
fn recovery_hint(stale_ms: u64) -> String {
    if stale_ms >= 300_000 {
        "Run has been stale for over 5 minutes. Consider cancelling and inspecting \
         the corpus, increasing mutation diversity, or restarting with a fresh seed set."
            .to_string()
    } else if stale_ms >= 60_000 {
        "Run has been stale for over 1 minute. Try adjusting mutator weights or \
         adding boundary seeds to the corpus."
            .to_string()
    } else {
        "Run appears stale. Verify the target is still reachable and the seed \
         corpus is not exhausted."
            .to_string()
    }
}

pub const HEARTBEAT_FILE_NAME: &str = "heartbeat.json";
pub const LOCK_FILE_NAME: &str = "run.lock";
pub const SWEEP_MARK_FILE_NAME: &str = ".sweep-mark";

/// Live heartbeat state persisted on disk in an active run directory.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Heartbeat {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub pid: u32,
}

impl Heartbeat {
    pub fn now() -> Self {
        Self {
            timestamp: chrono::Utc::now(),
            pid: std::process::id(),
        }
    }
}

/// Writes a fresh heartbeat file into the target directory.
pub fn write_heartbeat(dir: &std::path::Path) -> std::io::Result<()> {
    let hb = Heartbeat::now();
    let bytes = serde_json::to_vec_pretty(&hb)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    std::fs::write(dir.join(HEARTBEAT_FILE_NAME), bytes)
}

/// Writes a heartbeat with an explicit timestamp into the target directory.
pub fn write_heartbeat_at(dir: &std::path::Path, timestamp: chrono::DateTime<chrono::Utc>) -> std::io::Result<()> {
    let hb = Heartbeat {
        timestamp,
        pid: std::process::id(),
    };
    let bytes = serde_json::to_vec_pretty(&hb)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    std::fs::write(dir.join(HEARTBEAT_FILE_NAME), bytes)
}

/// Reads the heartbeat file from the target directory if present.
pub fn read_heartbeat(dir: &std::path::Path) -> Option<Heartbeat> {
    let path = dir.join(HEARTBEAT_FILE_NAME);
    if let Ok(bytes) = std::fs::read(&path) {
        if let Ok(hb) = serde_json::from_slice::<Heartbeat>(&bytes) {
            return Some(hb);
        }
    }
    if let Ok(meta) = std::fs::metadata(&path) {
        if let Ok(mtime) = meta.modified() {
            let dur = mtime.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
            return Some(Heartbeat {
                timestamp: chrono::DateTime::<chrono::Utc>::from(std::time::UNIX_EPOCH + dur),
                pid: 0,
            });
        }
    }
    None
}

/// Checks whether a run has a live heartbeat within the given TTL threshold.
pub fn is_heartbeat_alive(dir: &std::path::Path, ttl: chrono::Duration, now: chrono::DateTime<chrono::Utc>) -> bool {
    if let Some(hb) = read_heartbeat(dir) {
        let age = now.signed_duration_since(hb.timestamp);
        if age <= ttl && age >= -chrono::Duration::seconds(5) {
            return true;
        }
    }
    false
}

/// RAII advisory lock for a run directory to coordinate between active workers and sweepers.
pub struct RunDirLock {
    lock_path: std::path::PathBuf,
}

impl RunDirLock {
    /// Attempts to acquire an exclusive advisory lock file in `dir`.
    /// Returns `Some(RunDirLock)` if acquired, or `None` if already locked by a living process.
    pub fn try_acquire(dir: &std::path::Path) -> std::io::Result<Option<Self>> {
        let lock_path = dir.join(LOCK_FILE_NAME);
        if lock_path.exists() {
            if let Ok(contents) = std::fs::read_to_string(&lock_path) {
                if let Ok(pid) = contents.trim().parse::<u32>() {
                    if is_process_alive(pid) {
                        return Ok(None);
                    }
                }
            }
        }

        std::fs::write(&lock_path, format!("{}\n", std::process::id()))?;
        Ok(Some(Self { lock_path }))
    }

    /// Releases the lock explicitly.
    pub fn release(self) {
        // Drop cleans up lock file
    }
}

impl Drop for RunDirLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.lock_path);
    }
}

/// Checks whether a process with `pid` is currently alive.
fn is_process_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    if pid == std::process::id() {
        return true;
    }
    #[cfg(unix)]
    {
        extern "C" {
            fn kill(pid: i32, sig: i32) -> i32;
        }
        unsafe { kill(pid as i32, 0) == 0 }
    }
    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration as StdDuration;

    #[test]
    fn fresh_detector_is_ok() {
        let cfg = StaleDetectorConfig::new(5_000);
        let detector = StaleRunDetector::new(cfg);
        assert_eq!(detector.check(), StaleStatus::Ok);
    }

    #[test]
    fn detector_marks_stale_after_threshold() {
        let cfg = StaleDetectorConfig::new(50);
        let detector = StaleRunDetector::new(cfg);
        match detector.check_with_elapsed(StdDuration::from_millis(100)) {
            StaleStatus::Stale { stale_ms, hint } => {
                assert!(stale_ms >= 50, "expected stale_ms >= 50, got {stale_ms}");
                assert!(!hint.is_empty());
            }
            StaleStatus::Ok => panic!("expected Stale, got Ok"),
        }
    }

    #[test]
    fn record_progress_resets_stale_clock() {
        let cfg = StaleDetectorConfig::new(50);
        let mut detector = StaleRunDetector::new(cfg);
        thread::sleep(StdDuration::from_millis(80));
        // Would be stale here, but we record progress first.
        detector.record_progress();
        assert_eq!(detector.check(), StaleStatus::Ok);
    }

    #[test]
    fn stale_after_progress_then_silence() {
        let cfg = StaleDetectorConfig::new(50);
        let mut detector = StaleRunDetector::new(cfg);
        detector.record_progress();
        assert!(matches!(
            detector.check_with_elapsed(StdDuration::from_millis(100)),
            StaleStatus::Stale { .. }
        ));
    }

    #[test]
    fn elapsed_since_progress_increases_over_time() {
        let cfg = StaleDetectorConfig::new(5_000);
        let detector = StaleRunDetector::new(cfg);
        thread::sleep(StdDuration::from_millis(20));
        assert!(detector.elapsed_since_progress_ms() >= 10);
    }

    #[test]
    fn default_config_has_60s_threshold() {
        let cfg = StaleDetectorConfig::default();
        assert_eq!(cfg.stale_threshold_ms, 60_000);
    }

    #[test]
    fn recovery_hint_escalates_with_duration() {
        let short = super::recovery_hint(10_000);
        let medium = super::recovery_hint(90_000);
        let long = super::recovery_hint(400_000);
        // Each tier should produce a distinct message.
        assert_ne!(short, medium);
        assert_ne!(medium, long);
    }

    #[test]
    fn explicit_elapsed_below_threshold_is_ok() {
        let detector = StaleRunDetector::new(StaleDetectorConfig::new(1_000));
        assert_eq!(
            detector.check_with_elapsed(StdDuration::from_millis(999)),
            StaleStatus::Ok
        );
    }

    #[test]
    fn heartbeat_write_and_read_roundtrip() {
        let tmp = std::env::temp_dir().join(format!("crashlab-hb-test-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).expect("create tmp dir");

        write_heartbeat(&tmp).expect("write heartbeat");
        let hb = read_heartbeat(&tmp).expect("read heartbeat");
        assert_eq!(hb.pid, std::process::id());

        let now = chrono::Utc::now();
        assert!(is_heartbeat_alive(&tmp, chrono::Duration::seconds(10), now));
        assert!(!is_heartbeat_alive(&tmp, chrono::Duration::seconds(10), now + chrono::Duration::seconds(20)));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn run_dir_lock_exclusive() {
        let tmp = std::env::temp_dir().join(format!("crashlab-lock-test-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).expect("create tmp dir");

        let lock1 = RunDirLock::try_acquire(&tmp).expect("acquire lock 1");
        assert!(lock1.is_some());

        // Second acquisition attempt should detect process is alive and return None
        let lock2 = RunDirLock::try_acquire(&tmp).expect("acquire lock 2");
        assert!(lock2.is_none());

        drop(lock1);

        // After dropping, acquisition succeeds again
        let lock3 = RunDirLock::try_acquire(&tmp).expect("acquire lock 3");
        assert!(lock3.is_some());

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
