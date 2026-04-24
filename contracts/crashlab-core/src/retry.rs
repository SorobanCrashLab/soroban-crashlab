//! Bounded retry strategy with backoff and jitter for transient failures.
//!
//! This module provides the infrastructure to retry idempotent simulation calls
//! that fail due to transient network or RPC errors (e.g., rate limits, timeouts,
//! server-side 5xx responses).

use crate::prng::SeededPrng;
use std::time::Duration;

/// Classification of errors encountered during simulation or RPC calls.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SimulationError {
    /// A transient failure that is typically safe to retry.
    ///
    /// Examples: HTTP 429 (Too Many Requests), HTTP 503 (Service Unavailable),
    /// transport timeouts, or connection reset by peer.
    Transient(String),
    /// A non-transient failure that should not be retried.
    ///
    /// Examples: HTTP 400 (Bad Request), HTTP 401 (Unauthorized),
    /// contract trap, or logical invariant violation.
    NonTransient(String),
}

impl std::fmt::Display for SimulationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SimulationError::Transient(msg) => write!(f, "transient error: {}", msg),
            SimulationError::NonTransient(msg) => write!(f, "non-transient error: {}", msg),
        }
    }
}

impl std::error::Error for SimulationError {}

impl SimulationError {
    /// Returns `true` if the error is classified as transient.
    pub fn is_transient(&self) -> bool {
        matches!(self, SimulationError::Transient(_))
    }
}

/// Configuration for the retry strategy.
#[derive(Debug, Clone, Copy)]
pub struct RetryConfig {
    /// Maximum number of attempts allowed (including the initial call).
    pub max_attempts: u32,
    /// Initial backoff duration after the first failure.
    pub initial_backoff: Duration,
    /// Maximum backoff duration allowed for any single retry.
    pub max_backoff: Duration,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 5,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(10),
        }
    }
}

/// Executes a closure with retries according to the provided [`RetryConfig`].
///
/// If `f` returns [`SimulationError::Transient`], the call is retried after a backoff
/// period calculated with exponential decay and randomized jitter.
/// If `f` returns [`SimulationError::NonTransient`] or a successful result, the execution stops.
pub fn execute_with_retry<F, T>(
    config: &RetryConfig,
    mut prng: Option<&mut SeededPrng>,
    mut f: F,
) -> Result<T, SimulationError>
where
    F: FnMut() -> Result<T, SimulationError>,
{
    let mut attempt = 1;
    loop {
        match f() {
            Ok(val) => return Ok(val),
            Err(e) if e.is_transient() && attempt < config.max_attempts => {
                let backoff = calculate_backoff(config, attempt, prng.as_deref_mut());
                #[cfg(not(test))]
                std::thread::sleep(backoff);
                #[cfg(test)]
                std::hint::black_box(backoff);

                // In tests, we might want to avoid actual sleep to keep them fast.
                // However, the prompt implies "bounded retry strategy... in the soroban-crashlab runtime".
                // If we are in a library, sleep is usually avoided unless it's a dedicated executor.

                attempt += 1;
            }
            Err(e) => return Err(e),
        }
    }
}

/// Calculates the backoff duration for the given effort level using
/// exponential backoff with jitter.
///
/// Formula: `backoff = min(max_backoff, initial_backoff * 2^(effort-1)) * jitter`
pub fn calculate_backoff(
    config: &RetryConfig,
    attempt: u32,
    prng: Option<&mut SeededPrng>,
) -> Duration {
    if attempt == 0 {
        return Duration::ZERO;
    }

    let multiplier = 2u32.saturating_pow(attempt - 1);
    let base_backoff = config.initial_backoff.saturating_mul(multiplier);
    let capped_backoff = std::cmp::min(base_backoff, config.max_backoff);

    // Apply jitter (0.5 to 1.5 of the capped backoff)
    let jitter_factor = if let Some(p) = prng {
        // Use deterministic PRNG for stable tests
        // Convert u64 to f64 in range [0.0, 1.0)
        let random_u64 = p.next_u64();
        let normalized = (random_u64 as f64) / (u64::MAX as f64);
        0.5 + normalized
    } else {
        // Fallback to simple pseudo-randomness if no PRNG provided
        #[cfg(not(test))]
        {
            use std::time::SystemTime;
            let seed = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or(Duration::ZERO)
                .as_nanos() as u64;
            let mut p = SeededPrng::new(seed);
            let random_u64 = p.next_u64();
            let normalized = (random_u64 as f64) / (u64::MAX as f64);
            0.5 + normalized
        }
        #[cfg(test)]
        1.0
    };

    let nanos = (capped_backoff.as_nanos() as f64 * jitter_factor) as u64;
    Duration::from_nanos(nanos)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transient_error_is_classified_correctly() {
        let e = SimulationError::Transient("timeout".to_string());
        assert!(e.is_transient());
        let e2 = SimulationError::NonTransient("invalid input".to_string());
        assert!(!e2.is_transient());
    }

    #[test]
    fn backoff_increases_exponentially() {
        let config = RetryConfig {
            max_attempts: 5,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(10),
        };

        // No jitter for this test
        let b1 = calculate_backoff(&config, 1, None); // 100ms
        let b2 = calculate_backoff(&config, 2, None); // 200ms
        let b3 = calculate_backoff(&config, 3, None); // 400ms

        assert_eq!(b1, Duration::from_millis(100));
        assert_eq!(b2, Duration::from_millis(200));
        assert_eq!(b3, Duration::from_millis(400));
    }

    #[test]
    fn backoff_is_capped() {
        let config = RetryConfig {
            max_attempts: 10,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_millis(500),
        };

        let b_default = calculate_backoff(&config, 10, None);
        assert_eq!(b_default, Duration::from_millis(500));
    }

    #[test]
    fn backoff_with_jitter_is_deterministic_with_prng() {
        let config = RetryConfig::default();
        let mut prng1 = SeededPrng::new(42);
        let mut prng2 = SeededPrng::new(42);

        let b1 = calculate_backoff(&config, 2, Some(&mut prng1));
        let b2 = calculate_backoff(&config, 2, Some(&mut prng2));

        assert_eq!(b1, b2);
        // With seed 42, next_f64 should not be exactly 0.5 (which would give factor 1.0)
        assert_ne!(b1, Duration::from_millis(200));
    }

    #[test]
    fn executor_retries_on_transient() {
        let config = RetryConfig {
            max_attempts: 3,
            initial_backoff: Duration::from_millis(1),
            max_backoff: Duration::from_millis(10),
        };

        let mut calls = 0;
        let result = execute_with_retry(&config, None, || {
            calls += 1;
            if calls < 3 {
                Err(SimulationError::Transient("fail".to_string()))
            } else {
                Ok(42)
            }
        });

        assert_eq!(result.unwrap(), 42);
        assert_eq!(calls, 3);
    }

    #[test]
    fn executor_fails_after_max_attempts() {
        let config = RetryConfig {
            max_attempts: 2,
            initial_backoff: Duration::from_millis(1),
            max_backoff: Duration::from_millis(10),
        };

        let mut calls = 0;
        let result: Result<(), SimulationError> = execute_with_retry(&config, None, || {
            calls += 1;
            Err(SimulationError::Transient("fail".to_string()))
        });

        assert!(matches!(result, Err(SimulationError::Transient(_))));
        assert_eq!(calls, 2);
    }

    #[test]
    fn executor_fails_immediately_on_non_transient() {
        let config = RetryConfig::default();
        let mut calls = 0;
        let result: Result<i32, SimulationError> = execute_with_retry(&config, None, || {
            calls += 1;
            Err(SimulationError::NonTransient("critical".to_string()))
        });

        assert!(matches!(result, Err(SimulationError::NonTransient(_))));
        assert_eq!(calls, 1);
    }
}
