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
        let elapsed = self.last_progress.elapsed();
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
        // Use a very short threshold so the test doesn't need to sleep long.
        let cfg = StaleDetectorConfig::new(50);
        let detector = StaleRunDetector::new(cfg);
        thread::sleep(StdDuration::from_millis(100));
        match detector.check() {
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
        thread::sleep(StdDuration::from_millis(100));
        assert!(matches!(detector.check(), StaleStatus::Stale { .. }));
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
}
