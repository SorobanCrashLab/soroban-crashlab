//! Bounded retry strategy with backoff and jitter for transient failures.
//!
//! This module provides the infrastructure to retry idempotent simulation calls
//! that fail due to transient network or RPC errors (e.g., rate limits, timeouts,
//! server-side 5xx responses).

use crate::prng::SeededPrng;
use serde::{Deserialize, Serialize};
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
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct RetryConfig {
    /// Maximum number of attempts allowed (including the initial call).
    pub max_attempts: u32,
    /// Base delay in milliseconds before the first retry.
    pub base_delay_ms: u64,
    /// Maximum backoff duration allowed for any single retry (milliseconds).
    pub max_delay_ms: u64,
    /// Proportion of the computed delay that is randomized (0.0 to 1.0).
    /// 0.0 means no jitter, 1.0 means full jitter.
    pub jitter_factor: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay_ms: 100,
            max_delay_ms: 2000,
            jitter_factor: 0.5,
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
    execute_with_retry_counting(config, prng.as_deref_mut(), &mut f).0
}

/// Retry execution with an attempt counter for fault-injection assertions.
pub fn execute_with_retry_counting<F, T>(
    config: &RetryConfig,
    mut prng: Option<&mut SeededPrng>,
    f: &mut F,
) -> (Result<T, SimulationError>, u32)
where
    F: FnMut() -> Result<T, SimulationError>,
{
    let mut attempt = 0; // 0-indexed for calculation
    let mut calls = 0u32;
    loop {
        calls += 1;
        match f() {
            Ok(val) => return (Ok(val), calls),
            Err(e) if e.is_transient() && attempt + 1 < config.max_attempts => {
                let backoff = calculate_backoff(config, attempt, prng.as_deref_mut());

                #[cfg(not(test))]
                std::thread::sleep(backoff);
                #[cfg(test)]
                std::hint::black_box(backoff);

                attempt += 1;
            }
            Err(e) => return (Err(e), calls),
        }
    }
}

/// Maps a typed [`RpcFault`] to a retryable [`SimulationError`].
pub fn simulation_error_for_fault(fault: &crate::RpcFault) -> SimulationError {
    if fault.is_retryable() {
        SimulationError::Transient(fault.harness_message())
    } else {
        SimulationError::NonTransient(fault.harness_message())
    }
}

/// Calculates the backoff duration for the given effort level using
/// exponential backoff with jitter.
///
/// Formula: `backoff = min(max_backoff, initial_backoff * 2^(effort-1)) * jitter`
/// Formula: `delay = base_delay_ms * 2^attempt`, capped at `max_delay_ms`.
/// Jitter: `random(0, delay * jitter_factor) + delay * (1 - jitter_factor)`.
pub fn calculate_backoff(
    config: &RetryConfig,
    attempt: u32,
    prng: Option<&mut SeededPrng>,
) -> Duration {
    let multiplier = 2u64.saturating_pow(attempt);
    let base_backoff = config.base_delay_ms.saturating_mul(multiplier);
    let capped_backoff = std::cmp::min(base_backoff, config.max_delay_ms);

    let delay_f64 = capped_backoff as f64;
    let jitter_range = delay_f64 * config.jitter_factor;
    let fixed_part = delay_f64 * (1.0 - config.jitter_factor);

    let jitter_factor = if let Some(p) = prng {
        // Use deterministic PRNG for stable tests
        p.next_f64()
    } else {
        #[cfg(not(test))]
        {
            use std::time::SystemTime;
            let seed = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or(Duration::ZERO)
                .as_nanos() as u64;
            let mut p = SeededPrng::new(seed);
            p.next_f64()
        }
        #[cfg(test)]
        {
            0.5
        }
    };

    let random_component = jitter_factor * jitter_range;
    Duration::from_millis((random_component + fixed_part) as u64)
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
            base_delay_ms: 100,
            max_delay_ms: 10000,
            jitter_factor: 0.0, // No jitter for deterministic test
        };

        let b0 = calculate_backoff(&config, 0, None); // 100ms
        let b1 = calculate_backoff(&config, 1, None); // 200ms
        let b2 = calculate_backoff(&config, 2, None); // 400ms

        assert_eq!(b0, Duration::from_millis(100));
        assert_eq!(b1, Duration::from_millis(200));
        assert_eq!(b2, Duration::from_millis(400));
    }

    #[test]
    fn backoff_is_capped() {
        let config = RetryConfig {
            max_attempts: 10,
            base_delay_ms: 100,
            max_delay_ms: 500,
            jitter_factor: 0.0,
        };

        let b_default = calculate_backoff(&config, 10, None);
        assert_eq!(b_default, Duration::from_millis(500));
    }

    #[test]
    fn backoff_with_jitter_is_deterministic_with_prng() {
        let config = RetryConfig::default();
        let mut prng1 = SeededPrng::new(42);
        let mut prng2 = SeededPrng::new(42);

        let b1 = calculate_backoff(&config, 1, Some(&mut prng1));
        let b2 = calculate_backoff(&config, 1, Some(&mut prng2));

        assert_eq!(b1, b2);
    }

    #[test]
    fn executor_retries_on_transient() {
        let config = RetryConfig {
            max_attempts: 3,
            base_delay_ms: 1,
            max_delay_ms: 10,
            jitter_factor: 0.0,
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
            base_delay_ms: 1,
            max_delay_ms: 10,
            jitter_factor: 0.0,
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
