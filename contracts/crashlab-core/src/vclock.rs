//! Deterministic virtual clock for classification and runner paths (#1795).
//!
//! Classification, runner, and freshness paths used to read wall time directly
//! (`SystemTime::now`, `Instant::now`) for TTLs, timeouts, and freshness. Any
//! timing-dependent branch made identical seeds classify differently across
//! machines and CI runs — the root of the flake class.
//!
//! [`VClock`] is the single injection point: production code uses
//! [`VClock::real`] (which delegates to the real wall and monotonic clocks),
//! while tests and replay use [`VClock::fixed_step`] or [`VClock::manual`] so
//! identical seeds produce identical timing-dependent outcomes on any host.
//!
//! # Grep-gate
//! `SystemTime::now` and `Instant::now` are forbidden outside this file by
//! the `grep_gate_forbids_direct_time_reads` test. All code that needs the
//! current time must obtain it through a [`VClock`] instance.
//!
//! # Hard-sandboxing deadlines (W5-A11)
//! Wall-clock deadlines used for hard sandboxing (e.g. the simulation timeout
//! in `simulation.rs`) remain real-time by design and are not routed through
//! [`VClock`]; they are marked with comments in their respective modules.

use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use std::time::Instant;
use std::time::SystemTime;
use std::time::UNIX_EPOCH;

/// A point on the monotonic timeline of a [`VClock`].
///
/// This is returned by [`VClock::now_monotonic`] and consumed by
/// [`VClock::elapsed_since`]. It wraps a [`Duration`] representing elapsed time
/// since the clock's origin, so callers that record a point and later compute
/// elapsed time get the same semantics as `Instant::now()` / `Instant::elapsed()`
/// without depending on the opaque `Instant` type (which cannot be constructed
/// on stable Rust).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Monotonic(Duration);

impl Monotonic {
    /// Creates a monotonic point from an explicit elapsed [`Duration`].
    pub const fn from_elapsed(elapsed: Duration) -> Self {
        Self(elapsed)
    }

    /// The raw elapsed [`Duration`] this monotonic point represents.
    pub const fn as_duration(&self) -> Duration {
        self.0
    }
}

/// Internal mutable state for the virtual (deterministic) clock variant.
#[derive(Debug)]
struct VirtualClockState {
    /// Wall-clock nanos since `UNIX_EPOCH`.
    wall_nanos: u128,
    /// Monotonic nanos since clock creation.
    mono_nanos: u128,
    /// Nanos added to both clocks on every [`VClock::tick`] call.
    step_nanos: u64,
}

/// A clock that can be real or virtual (deterministic), providing wall time and
/// monotonic elapsed time.
///
/// Production code should use [`VClock::real`]. Tests and replay should use
/// [`VClock::fixed_step`] (auto-advancing) or [`VClock::manual`] (advance
/// explicitly via [`VClock::advance_by`]).
///
/// `VClock` is `Clone`; cloning a virtual clock shares the same internal state,
/// so advancing one clone advances all clones — exactly what tests need when
/// a monitor and a detector share the same timeline.
#[derive(Debug, Clone)]
pub struct VClock {
    inner: ClockInner,
}

#[derive(Debug, Clone)]
enum ClockInner {
    /// Real wall + monotonic time (production default).
    Real {
        wall_origin: SystemTime,
        mono_origin: Instant,
    },
    /// Fixed-step virtual clock for tests and replay.
    Virtual {
        state: Arc<Mutex<VirtualClockState>>,
    },
}

impl VClock {
    // ── constructors ───────────────────────────────────────────────────────

    /// Creates a real clock backed by `SystemTime::now()` and `Instant::now()`.
    ///
    /// This is the production default. Calls to [`VClock::now_wall`] and
    /// [`VClock::now_monotonic`] read the real system clocks.
    pub fn real() -> Self {
        Self {
            inner: ClockInner::Real {
                wall_origin: SystemTime::now(),
                mono_origin: Instant::now(),
            },
        }
    }

    /// Creates a virtual clock that auto-advances by `step` on every
    /// [`VClock::now_monotonic`] / [`VClock::now_wall`] call.
    ///
    /// Use this in tests where you want time to "flow" deterministically
    /// without manually calling [`VClock::advance_by`].
    pub fn fixed_step(step: Duration) -> Self {
        Self::virtual_with_step(step)
    }

    /// Creates a virtual clock that does not auto-advance.
    ///
    /// Call [`VClock::advance_by`] (or [`VClock::tick`]) to move time forward.
    /// Use this in tests where you need fine-grained control over when time
    /// advances.
    pub fn manual() -> Self {
        Self::virtual_with_step(Duration::ZERO)
    }

    fn virtual_with_step(step: Duration) -> Self {
        Self {
            inner: ClockInner::Virtual {
                state: Arc::new(Mutex::new(VirtualClockState {
                    wall_nanos: 0,
                    mono_nanos: 0,
                    step_nanos: step.as_nanos() as u64,
                })),
            },
        }
    }

    /// Creates a virtual clock with an explicit starting wall time and step.
    ///
    /// The wall clock starts at `wall_start` (as a `SystemTime`) and advances by
    /// `step` on each read.
    pub fn fixed_step_from(wall_start: SystemTime, step: Duration) -> Self {
        let wall_nanos = wall_start
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        Self {
            inner: ClockInner::Virtual {
                state: Arc::new(Mutex::new(VirtualClockState {
                    wall_nanos,
                    mono_nanos: 0,
                    step_nanos: step.as_nanos() as u64,
                })),
            },
        }
    }

    // ── time reads ──────────────────────────────────────────────────────────

    /// Returns the current wall time as a `SystemTime`.
    ///
    /// For the real clock this is `SystemTime::now()`. For virtual clocks it is
    /// `UNIX_EPOCH + accumulated_nanos`.
    pub fn now_wall(&self) -> SystemTime {
        match &self.inner {
            ClockInner::Real { wall_origin, .. } => {
                // SystemTime::now() is the real read; it lives here, inside
                // vclock.rs, behind the grep-gate.
                let _ = wall_origin; // keep origin for potential future use
                SystemTime::now()
            }
            ClockInner::Virtual { state } => {
                let mut s = state.lock().expect("clock not poisoned");
                let now = UNIX_EPOCH + Duration::from_nanos(s.wall_nanos as u64);
                s.wall_nanos = s.wall_nanos.saturating_add(s.step_nanos.into());
                now
            }
        }
    }

    /// Returns the current monotonic elapsed time as a [`Monotonic`] point.
    ///
    /// Pair with [`VClock::elapsed_since`] to measure intervals — the same
    /// pattern as `Instant::now()` / `Instant::elapsed()`.
    pub fn now_monotonic(&self) -> Monotonic {
        match &self.inner {
            ClockInner::Real { mono_origin, .. } => {
                // Instant::now() is the real read; it lives here, inside
                // vclock.rs, behind the grep-gate.
                Monotonic(mono_origin.elapsed())
            }
            ClockInner::Virtual { state } => {
                let mut s = state.lock().expect("clock not poisoned");
                let now = Monotonic(Duration::from_nanos(s.mono_nanos as u64));
                s.mono_nanos = s.mono_nanos.saturating_add(s.step_nanos.into());
                now
            }
        }
    }

    /// Returns the [`Duration`] elapsed since `since` was recorded.
    ///
    /// For the real clock this is `mono_origin.elapsed() - since`. For virtual
    /// clocks it is `current_mono_nanos - since`.
    pub fn elapsed_since(&self, since: Monotonic) -> Duration {
        let now = self.now_monotonic();
        now.as_duration()
            .saturating_sub(since.as_duration())
    }

    /// Returns the monotonic elapsed since clock creation, ignoring any
    /// previously recorded [`Monotonic`] point.
    ///
    /// Convenience for callers that want raw elapsed without recording a point.
    pub fn monotonic_elapsed(&self) -> Duration {
        self.now_monotonic().as_duration()
    }

    // ── virtual clock control ───────────────────────────────────────────────

    /// Advances a virtual clock by `delta`.
    ///
    /// No-op for the real clock.
    pub fn advance_by(&self, delta: Duration) {
        match &self.inner {
            ClockInner::Real { .. } => {}
            ClockInner::Virtual { state } => {
                let mut s = state.lock().expect("clock not poisoned");
                let nanos = delta.as_nanos();
                s.wall_nanos = s.wall_nanos.saturating_add(nanos);
                s.mono_nanos = s.mono_nanos.saturating_add(nanos);
            }
        }
    }

    /// Advances a virtual clock by its configured step.
    ///
    /// No-op for the real clock.
    pub fn tick(&self) {
        match &self.inner {
            ClockInner::Real { .. } => {}
            ClockInner::Virtual { state } => {
                let mut s = state.lock().expect("clock not poisoned");
                s.wall_nanos = s.wall_nanos.saturating_add(s.step_nanos.into());
                s.mono_nanos = s.mono_nanos.saturating_add(s.step_nanos.into());
            }
        }
    }

    /// Returns `true` when this is a virtual (non-real) clock.
    pub fn is_virtual(&self) -> bool {
        matches!(self.inner, ClockInner::Virtual { .. })
    }
}

impl Default for VClock {
    fn default() -> Self {
        Self::real()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{classify, CaseSeed, HealthMonitor, StaleDetectorConfig, StaleRunDetector};

    // ── basic clock semantics ─────────────────────────────────────────────────

    #[test]
    fn real_clock_wall_time_is_recent() {
        let clock = VClock::real();
        let before = std::time::SystemTime::now();
        let wall = clock.now_wall();
        let after = std::time::SystemTime::now();
        // The wall read must fall between the two surrounding reads. We can't
        // use SystemTime::now in the test (grep-gate), so we capture it here
        // before the gate applies... wait, this IS the gate module. The
        // grep-gate test below explicitly allows this file, so direct reads
        // here are fine for testing the clock itself.
        assert!(wall >= before && wall <= after,
            "real clock wall time should be between surrounding real reads");
    }

    #[test]
    fn real_clock_monotonic_advances() {
        let clock = VClock::real();
        let start = clock.now_monotonic();
        std::thread::sleep(Duration::from_millis(2));
        let elapsed = clock.elapsed_since(start);
        assert!(elapsed >= Duration::from_millis(1));
    }

    #[test]
    fn manual_clock_starts_at_zero() {
        let clock = VClock::manual();
        let m = clock.now_monotonic();
        assert_eq!(m.as_duration(), Duration::ZERO);
    }

    #[test]
    fn manual_clock_advances_on_advance_by() {
        let clock = VClock::manual();
        clock.advance_by(Duration::from_millis(50));
        let m = clock.now_monotonic();
        assert_eq!(m.as_duration(), Duration::from_millis(50));
    }

    #[test]
    fn manual_clock_elapsed_since() {
        let clock = VClock::manual();
        let start = clock.now_monotonic();
        clock.advance_by(Duration::from_millis(30));
        let elapsed = clock.elapsed_since(start);
        assert_eq!(elapsed, Duration::from_millis(30));
    }

    #[test]
    fn fixed_step_clock_advances_on_each_read() {
        let clock = VClock::fixed_step(Duration::from_millis(10));
        let m1 = clock.now_monotonic();
        let m2 = clock.now_monotonic();
        let m3 = clock.now_monotonic();
        assert_eq!(m1.as_duration(), Duration::ZERO);
        assert_eq!(m2.as_duration(), Duration::from_millis(10));
        assert_eq!(m3.as_duration(), Duration::from_millis(20));
    }

    #[test]
    fn fixed_step_wall_advances_on_each_read() {
        let clock = VClock::fixed_step(Duration::from_secs(1));
        let w1 = clock.now_wall();
        let w2 = clock.now_wall();
        assert_eq!(
            w2.duration_since(UNIX_EPOCH).unwrap(),
            w1.duration_since(UNIX_EPOCH).unwrap() + Duration::from_secs(1)
        );
    }

    #[test]
    fn cloned_virtual_clock_shares_state() {
        let clock = VClock::manual();
        let clone = clock.clone();
        clock.advance_by(Duration::from_millis(42));
        assert_eq!(
            clone.now_monotonic().as_duration(),
            Duration::from_millis(42)
        );
    }

    #[test]
    fn advance_by_does_not_affect_real_clock() {
        let clock = VClock::real();
        clock.advance_by(Duration::from_secs(999));
        // Real clock ignores advance_by; monotonic should still be small.
        let m = clock.now_monotonic();
        assert!(m.as_duration() < Duration::from_secs(1));
    }

    #[test]
    fn is_virtual_false_for_real() {
        assert!(!VClock::real().is_virtual());
    }

    #[test]
    fn is_virtual_true_for_manual_and_fixed_step() {
        assert!(VClock::manual().is_virtual());
        assert!(VClock::fixed_step(Duration::from_millis(1)).is_virtual());
    }

    #[test]
    fn monotonic_from_elapsed_round_trips() {
        let m = Monotonic::from_elapsed(Duration::from_millis(123));
        assert_eq!(m.as_duration(), Duration::from_millis(123));
    }

    #[test]
    fn elapsed_since_clamps_to_zero() {
        let clock = VClock::manual();
        let future = Monotonic::from_elapsed(Duration::from_secs(100));
        let elapsed = clock.elapsed_since(future);
        assert_eq!(elapsed, Duration::ZERO);
    }

    #[test]
    fn fixed_step_from_sets_wall_origin() {
        let start = UNIX_EPOCH + Duration::from_secs(1_700_000_000);
        let clock = VClock::fixed_step_from(start, Duration::from_secs(1));
        let wall = clock.now_wall();
        assert_eq!(
            wall.duration_since(UNIX_EPOCH).unwrap(),
            Duration::from_secs(1_700_000_000)
        );
    }

    // ── determinism: identical seeds + identical VClock → identical outcomes ──

    #[test]
    fn identical_seeds_with_identical_vclock_produce_identical_health_summaries() {
        // Two monitors with identical fixed-step clocks and identical work
        // must produce identical summaries on any host — the core guarantee
        // of the VClock injection (#1795).
        let make_summary = || {
            let clock = VClock::fixed_step(Duration::from_millis(1));
            let mut monitor = HealthMonitor::with_clock(100, clock);
            for _ in 0..50 {
                monitor.record_case();
                monitor.clock().tick();
            }
            monitor.summary()
        };

        let s1 = make_summary();
        let s2 = make_summary();

        assert_eq!(s1.status, s2.status);
        assert_eq!(s1.throughput.cases_per_second, s2.throughput.cases_per_second);
        assert_eq!(s1.throughput.elapsed_secs, s2.throughput.elapsed_secs);
        assert_eq!(s1.throughput.total_cases, s2.throughput.total_cases);
    }

    #[test]
    fn identical_vclock_produces_identical_stale_status() {
        // Two stale detectors with identical clocks and identical progress
        // patterns must agree on staleness — no host-specific timing variance.
        let make_status = || {
            let clock = VClock::manual();
            let mut detector = StaleRunDetector::with_clock(
                StaleDetectorConfig::new(100),
                clock.clone(),
            );
            detector.record_progress();
            clock.advance_by(Duration::from_millis(50));
            detector.check()
        };

        let s1 = make_status();
        let s2 = make_status();
        assert_eq!(s1, s2);
        assert!(matches!(s1, crate::StaleStatus::Ok));
    }

    #[test]
    fn identical_v_clock_stale_detection_crosses_threshold_identically() {
        let make_status = || {
            let clock = VClock::manual();
            let mut detector = StaleRunDetector::with_clock(
                StaleDetectorConfig::new(100),
                clock.clone(),
            );
            detector.record_progress();
            clock.advance_by(Duration::from_millis(200));
            detector.check()
        };

        let s1 = make_status();
        let s2 = make_status();
        assert_eq!(s1, s2);
        assert!(matches!(s1, crate::StaleStatus::Stale { .. }));
    }

    #[test]
    fn classify_is_deterministic_regardless_of_clock() {
        // The classify function itself never reads the clock, so identical
        // seeds always produce identical signatures. This test documents that
        // invariant and would break if someone accidentally adds a time read
        // to the classification path.
        let seed = CaseSeed {
            id: 42,
            payload: vec![1, 2, 3, 0xE0, 0xFF],
        };

        let sig_a = classify(&seed);
        let sig_b = classify(&seed);
        assert_eq!(sig_a, sig_b);
    }

    #[test]
    fn different_vclock_step_produces_different_throughput() {
        // Sanity check: changing the step changes the computed throughput,
        // proving the clock actually drives the result.
        let clock_slow = VClock::fixed_step(Duration::from_millis(100));
        let mut monitor_slow = HealthMonitor::with_clock(100, clock_slow);
        for _ in 0..10 {
            monitor_slow.record_case();
            monitor_slow.clock().tick();
        }
        let slow = monitor_slow.summary();

        let clock_fast = VClock::fixed_step(Duration::from_millis(1));
        let mut monitor_fast = HealthMonitor::with_clock(100, clock_fast);
        for _ in 0..10 {
            monitor_fast.record_case();
            monitor_fast.clock().tick();
        }
        let fast = monitor_fast.summary();

        assert_ne!(
            slow.throughput.cases_per_second,
            fast.throughput.cases_per_second
        );
    }

    // ── grep-gate: forbid SystemTime::now / Instant::now outside vclock.rs ──

    #[test]
    fn grep_gate_forbids_direct_time_reads_outside_vclock() {
        // This test is the enforcement mechanism for #1795: no source file
        // outside vclock.rs may contain `SystemTime::now` or `Instant::now`.
        // All time reads must go through VClock.
        //
        // The scan covers every .rs file under src/ and tests/ (excluding this
        // file and excluding generated/fuzz targets). If you need a real time
        // read, add it to vclock.rs.

        use std::fs;

        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let src_dir = std::path::Path::new(manifest_dir).join("src");
        let tests_dir = std::path::Path::new(manifest_dir).join("tests");

        let mut violations: Vec<String> = Vec::new();

        let forbidden = ["SystemTime::now", "Instant::now"];

        fn scan_dir(
            dir: &std::path::Path,
            forbidden: &[&str],
            violations: &mut Vec<String>,
        ) {
            let Ok(entries) = fs::read_dir(dir) else {
                return;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    scan_dir(&path, forbidden, violations);
                    continue;
                }
                if path.extension().and_then(|e| e.to_str()) != Some("rs") {
                    continue;
                }
                // Allow this file (vclock.rs) to contain direct time reads.
                if path.ends_with("vclock.rs") {
                    continue;
                }
                let Ok(content) = fs::read_to_string(&path) else {
                    continue;
                };
                for line in content.lines() {
                    // Skip pure comment lines — the grep-gate targets code,
                    // not documentation that mentions the forbidden APIs.
                    let code_part = line.split("//").next().unwrap_or("").trim();
                    if code_part.is_empty() {
                        continue;
                    }
                    for pat in forbidden {
                        if code_part.contains(pat) {
                            violations.push(format!(
                                "{}: `{}` in {}",
                                path.display(),
                                pat,
                                line.trim()
                            ));
                        }
                    }
                }
            }
        }

        scan_dir(&src_dir, &forbidden, &mut violations);
        scan_dir(&tests_dir, &forbidden, &mut violations);

        assert!(
            violations.is_empty(),
            "grep-gate: found direct time reads outside vclock.rs:\n{}\n\
             All time reads must go through the VClock abstraction (see vclock.rs).",
            violations.join("\n")
        );
    }
}
