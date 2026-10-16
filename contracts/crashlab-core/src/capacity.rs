//! Capacity quotas for fuzz campaigns (#1904).
//!
//! A *scope* (today always `global`; per-org/project once tenancy lands) owns a
//! set of [`QuotaLimits`]. Two enforcement points share the same rules:
//!
//! - **Admission** — [`check_admission`] runs before a campaign is created and
//!   rejects a [`ResourceRequest`] that would push the scope over a limit.
//! - **Mid-run throttle** — a [`QuotaGuard`] is shared by every worker drawing
//!   on one scope's daily seed allowance and stops admitting seeds once the
//!   allowance (minus headroom reserved for higher-priority classes) is spent.
//!
//! Both are priority aware: a lower-priority [`CampaignClass`] may not consume
//! the headroom reserved for higher-priority classes, so a deep campaign can
//! never starve interactive or nightly work. The web API mirrors these rules in
//! `apps/web/src/lib/capacity/quotas.ts`; see `docs/ops/capacity.md`.
//!
//! # Example
//!
//! ```rust
//! use crashlab_core::campaign_presets::CampaignClass;
//! use crashlab_core::capacity::{QuotaGuard, ThrottleDecision};
//!
//! // 100 seeds left today; deep campaigns may not touch the last 25.
//! let guard = QuotaGuard::new(100);
//! let mut admitted = 0;
//! while guard.admit_seed(CampaignClass::Deep) == ThrottleDecision::Proceed {
//!     admitted += 1;
//! }
//! assert_eq!(admitted, 75);
//! // Interactive work can still use the reserved headroom.
//! assert_eq!(guard.admit_seed(CampaignClass::Interactive), ThrottleDecision::Proceed);
//! ```

use crate::campaign_presets::CampaignClass;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

/// Basis points of every limit a class may **not** consume.
///
/// Interactive work may use the whole limit; nightly leaves 10% for
/// interactive; deep leaves 25% for nightly and interactive.
pub const fn reserved_headroom_bps(class: CampaignClass) -> u64 {
    match class {
        CampaignClass::Interactive => 0,
        CampaignClass::Nightly => 1_000,
        CampaignClass::Deep => 2_500,
    }
}

/// The part of `limit` that `class` may consume.
pub const fn effective_limit(limit: u64, class: CampaignClass) -> u64 {
    // Widen so `limit * bps` cannot overflow for any u64 limit.
    let reserved = (limit as u128 * reserved_headroom_bps(class) as u128 / 10_000) as u64;
    limit - reserved
}

/// A quota-governed resource.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuotaResource {
    ConcurrentWorkers,
    SeedsPerDay,
    StorageBytes,
    RpcCallsPerDay,
}

impl QuotaResource {
    /// Stable snake_case name shared with the web API error payloads.
    pub const fn as_str(self) -> &'static str {
        match self {
            QuotaResource::ConcurrentWorkers => "concurrent_workers",
            QuotaResource::SeedsPerDay => "seeds_per_day",
            QuotaResource::StorageBytes => "storage_bytes",
            QuotaResource::RpcCallsPerDay => "rpc_calls_per_day",
        }
    }
}

/// Limits for one scope. `None` means unlimited, which is the default so an
/// unconfigured deployment behaves exactly as before quotas existed.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotaLimits {
    pub concurrent_workers: Option<u64>,
    pub seeds_per_day: Option<u64>,
    pub storage_bytes: Option<u64>,
    pub rpc_calls_per_day: Option<u64>,
}

/// Current consumption for one scope.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotaUsage {
    pub active_workers: u64,
    pub seeds_today: u64,
    pub storage_bytes: u64,
    pub rpc_calls_today: u64,
}

/// What a new campaign asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResourceRequest {
    pub class: CampaignClass,
    pub workers: u64,
    pub seeds: u64,
    pub rpc_calls: u64,
}

/// Why admission was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotaViolation {
    pub resource: QuotaResource,
    /// The limit as seen by the requesting class (headroom already removed).
    pub limit: u64,
    pub used: u64,
    pub requested: u64,
}

impl fmt::Display for QuotaViolation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "quota exceeded for {}: used {} + requested {} > limit {}",
            self.resource.as_str(),
            self.used,
            self.requested,
            self.limit
        )
    }
}

impl std::error::Error for QuotaViolation {}

/// Checks `request` against `limits` given current `usage`.
///
/// Resources are checked in a fixed order (workers, seeds, RPC calls, storage)
/// so the reported violation is deterministic. Storage is not requested up
/// front; a scope already at its storage limit admits nothing new.
pub fn check_admission(
    limits: &QuotaLimits,
    usage: &QuotaUsage,
    request: &ResourceRequest,
) -> Result<(), QuotaViolation> {
    let checks = [
        (
            QuotaResource::ConcurrentWorkers,
            limits.concurrent_workers,
            usage.active_workers,
            request.workers,
        ),
        (
            QuotaResource::SeedsPerDay,
            limits.seeds_per_day,
            usage.seeds_today,
            request.seeds,
        ),
        (
            QuotaResource::RpcCallsPerDay,
            limits.rpc_calls_per_day,
            usage.rpc_calls_today,
            request.rpc_calls,
        ),
    ];

    for (resource, limit, used, requested) in checks {
        if let Some(limit) = limit {
            let limit = effective_limit(limit, request.class);
            if used.saturating_add(requested) > limit {
                return Err(QuotaViolation {
                    resource,
                    limit,
                    used,
                    requested,
                });
            }
        }
    }

    if let Some(limit) = limits.storage_bytes {
        let limit = effective_limit(limit, request.class);
        if usage.storage_bytes >= limit {
            return Err(QuotaViolation {
                resource: QuotaResource::StorageBytes,
                limit,
                used: usage.storage_bytes,
                requested: 0,
            });
        }
    }

    Ok(())
}

/// Outcome of asking a [`QuotaGuard`] for one more seed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThrottleDecision {
    /// One seed of allowance was consumed; run it.
    Proceed,
    /// The class has reached its share of the allowance; skip the seed.
    Throttled {
        /// Allowance left in the shared pool.
        remaining: u64,
        /// Part of `remaining` held back for higher-priority classes.
        reserved: u64,
    },
}

/// Mid-run seed throttle shared by every worker drawing on one allowance.
///
/// Cloning is cheap and clones share the same pool, so concurrent workers of
/// one campaign — or campaigns of different classes in one process — draw from
/// a single counter and the throttle takes effect mid-run, not only at
/// admission.
#[derive(Debug, Clone)]
pub struct QuotaGuard {
    allowance: u64,
    remaining: Arc<AtomicU64>,
}

impl QuotaGuard {
    /// A guard over `allowance` seeds (typically the scope's remaining daily
    /// seed quota at dispatch time).
    pub fn new(allowance: u64) -> Self {
        Self {
            allowance,
            remaining: Arc::new(AtomicU64::new(allowance)),
        }
    }

    /// Allowance the guard started with.
    pub fn allowance(&self) -> u64 {
        self.allowance
    }

    /// Allowance left in the shared pool.
    pub fn remaining(&self) -> u64 {
        self.remaining.load(Ordering::Acquire)
    }

    /// Consumes one seed for `class` unless that would dip into the headroom
    /// reserved for higher-priority classes.
    pub fn admit_seed(&self, class: CampaignClass) -> ThrottleDecision {
        let reserved = self.allowance - effective_limit(self.allowance, class);
        let mut current = self.remaining.load(Ordering::Acquire);
        loop {
            if current <= reserved {
                return ThrottleDecision::Throttled {
                    remaining: current,
                    reserved,
                };
            }
            match self.remaining.compare_exchange_weak(
                current,
                current - 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => return ThrottleDecision::Proceed,
                Err(observed) => current = observed,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(class: CampaignClass, workers: u64, seeds: u64) -> ResourceRequest {
        ResourceRequest {
            class,
            workers,
            seeds,
            rpc_calls: 0,
        }
    }

    #[test]
    fn unlimited_by_default() {
        let limits = QuotaLimits::default();
        let usage = QuotaUsage {
            active_workers: u64::MAX / 2,
            seeds_today: u64::MAX / 2,
            storage_bytes: u64::MAX,
            rpc_calls_today: u64::MAX / 2,
        };
        assert!(check_admission(
            &limits,
            &usage,
            &request(CampaignClass::Deep, 64, 1_000_000)
        )
        .is_ok());
    }

    #[test]
    fn headroom_shrinks_limit_for_lower_priority_classes() {
        assert_eq!(effective_limit(100, CampaignClass::Interactive), 100);
        assert_eq!(effective_limit(100, CampaignClass::Nightly), 90);
        assert_eq!(effective_limit(100, CampaignClass::Deep), 75);
        // No overflow at the top of the range.
        assert!(effective_limit(u64::MAX, CampaignClass::Deep) < u64::MAX);
    }

    #[test]
    fn rejects_workers_over_limit_with_details() {
        let limits = QuotaLimits {
            concurrent_workers: Some(8),
            ..QuotaLimits::default()
        };
        let usage = QuotaUsage {
            active_workers: 6,
            ..QuotaUsage::default()
        };
        assert!(
            check_admission(&limits, &usage, &request(CampaignClass::Interactive, 2, 0)).is_ok()
        );

        let err = check_admission(&limits, &usage, &request(CampaignClass::Interactive, 3, 0))
            .unwrap_err();
        assert_eq!(err.resource, QuotaResource::ConcurrentWorkers);
        assert_eq!((err.limit, err.used, err.requested), (8, 6, 3));
        assert!(err.to_string().contains("concurrent_workers"));
    }

    #[test]
    fn deep_campaign_cannot_take_reserved_seed_headroom() {
        let limits = QuotaLimits {
            seeds_per_day: Some(1_000),
            ..QuotaLimits::default()
        };
        let usage = QuotaUsage {
            seeds_today: 700,
            ..QuotaUsage::default()
        };
        // Deep may use 750: 700 + 100 is over.
        let err =
            check_admission(&limits, &usage, &request(CampaignClass::Deep, 1, 100)).unwrap_err();
        assert_eq!(err.resource, QuotaResource::SeedsPerDay);
        assert_eq!(err.limit, 750);
        // Interactive may use all 1000.
        assert!(check_admission(
            &limits,
            &usage,
            &request(CampaignClass::Interactive, 1, 100)
        )
        .is_ok());
    }

    #[test]
    fn checks_resources_in_fixed_order() {
        let limits = QuotaLimits {
            concurrent_workers: Some(1),
            seeds_per_day: Some(1),
            rpc_calls_per_day: Some(1),
            storage_bytes: Some(1),
        };
        let usage = QuotaUsage {
            active_workers: 1,
            seeds_today: 1,
            storage_bytes: 1,
            rpc_calls_today: 1,
        };
        let err = check_admission(&limits, &usage, &request(CampaignClass::Interactive, 1, 1))
            .unwrap_err();
        assert_eq!(err.resource, QuotaResource::ConcurrentWorkers);
    }

    #[test]
    fn rpc_and_storage_limits_are_enforced() {
        let limits = QuotaLimits {
            rpc_calls_per_day: Some(10),
            ..QuotaLimits::default()
        };
        let req = ResourceRequest {
            class: CampaignClass::Interactive,
            workers: 1,
            seeds: 1,
            rpc_calls: 11,
        };
        let err = check_admission(&limits, &QuotaUsage::default(), &req).unwrap_err();
        assert_eq!(err.resource, QuotaResource::RpcCallsPerDay);

        let limits = QuotaLimits {
            storage_bytes: Some(1_024),
            ..QuotaLimits::default()
        };
        let full = QuotaUsage {
            storage_bytes: 1_024,
            ..QuotaUsage::default()
        };
        let err = check_admission(&limits, &full, &request(CampaignClass::Interactive, 1, 1))
            .unwrap_err();
        assert_eq!(err.resource, QuotaResource::StorageBytes);
        assert_eq!(err.requested, 0);
    }

    #[test]
    fn guard_throttles_mid_run_and_respects_priority() {
        let guard = QuotaGuard::new(20);
        let mut nightly = 0;
        while guard.admit_seed(CampaignClass::Nightly) == ThrottleDecision::Proceed {
            nightly += 1;
        }
        // Nightly leaves 10% (2 seeds) for interactive.
        assert_eq!(nightly, 18);
        assert_eq!(
            guard.admit_seed(CampaignClass::Deep),
            ThrottleDecision::Throttled {
                remaining: 2,
                reserved: 5
            }
        );
        assert_eq!(
            guard.admit_seed(CampaignClass::Interactive),
            ThrottleDecision::Proceed
        );
        assert_eq!(
            guard.admit_seed(CampaignClass::Interactive),
            ThrottleDecision::Proceed
        );
        assert_eq!(
            guard.admit_seed(CampaignClass::Interactive),
            ThrottleDecision::Throttled {
                remaining: 0,
                reserved: 0
            }
        );
    }

    #[test]
    fn guard_clones_share_one_pool_across_threads() {
        let guard = QuotaGuard::new(1_000);
        let handles: Vec<_> = (0..4)
            .map(|_| {
                let g = guard.clone();
                std::thread::spawn(move || {
                    let mut n = 0u64;
                    while g.admit_seed(CampaignClass::Interactive) == ThrottleDecision::Proceed {
                        n += 1;
                    }
                    n
                })
            })
            .collect();
        let total: u64 = handles.into_iter().map(|h| h.join().unwrap()).sum();
        assert_eq!(total, 1_000);
        assert_eq!(guard.remaining(), 0);
        assert_eq!(guard.allowance(), 1_000);
    }

    #[test]
    fn violation_serialises_with_snake_case_resource() {
        let v = QuotaViolation {
            resource: QuotaResource::SeedsPerDay,
            limit: 1,
            used: 1,
            requested: 1,
        };
        let json = serde_json::to_string(&v).unwrap();
        assert!(json.contains("\"seeds_per_day\""));
    }
}
