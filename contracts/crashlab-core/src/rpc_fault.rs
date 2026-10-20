//! Typed RPC fault taxonomy (#1787).
//!
//! Parses RPC error envelopes into a typed [`RpcFault`] so retry logic can
//! distinguish transport noise from genuine contract faults. Transport and
//! rate-limit faults never enter the crash corpus and never fail a seed.

use crate::taxonomy::FailureClass;
use serde::{Deserialize, Serialize};

/// Typed RPC failure.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RpcFault {
    /// Connect/timeout/reset.
    Transport { detail: String },
    /// 429/503 with optional retry-after.
    RateLimited { retry_after_ms: Option<u64> },
    /// Nonce gap requiring re-sync and single replay.
    Sequence { detail: String },
    /// Fee/budget refusal with detail for signature analysis.
    Resource { detail: String },
    /// Genuine contract trap.
    Contract { detail: String },
    /// Archived entry.
    NotFound { detail: String },
}

impl RpcFault {
    /// Maps this fault to a taxonomy leaf distinct from contract outcomes.
    pub fn failure_class(&self) -> FailureClass {
        match self {
            RpcFault::Transport { .. } => FailureClass::RpcTransport,
            RpcFault::RateLimited { .. } => FailureClass::RpcRateLimited,
            RpcFault::Sequence { .. } => FailureClass::RpcSequence,
            RpcFault::Resource { .. } => FailureClass::RpcResource,
            RpcFault::Contract { .. } => FailureClass::RpcContract,
            RpcFault::NotFound { .. } => FailureClass::RpcNotFound,
        }
    }

    /// True when the fault is safe to retry.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            RpcFault::Transport { .. }
                | RpcFault::RateLimited { .. }
                | RpcFault::Sequence { .. }
        )
    }

    /// True when the fault must never enter the crash corpus.
    pub fn excludes_from_corpus(&self) -> bool {
        matches!(
            self,
            RpcFault::Transport { .. } | RpcFault::RateLimited { .. }
        )
    }

    /// Parses an RPC error envelope (`code`, `message`, `http_status`).
    pub fn parse_envelope(code: Option<i64>, message: &str, http_status: Option<u16>) -> Self {
        let lower = message.to_lowercase();
        if let Some(status) = http_status {
            if status == 429 || status == 503 {
                return RpcFault::RateLimited {
                    retry_after_ms: None,
                };
            }
            if status == 404 {
                return RpcFault::NotFound {
                    detail: message.to_string(),
                };
            }
            if (500..600).contains(&status) {
                return RpcFault::Transport {
                    detail: message.to_string(),
                };
            }
        }
        if lower.contains("nonce") || lower.contains("sequence") || lower.contains("bad_seq") {
            return RpcFault::Sequence {
                detail: message.to_string(),
            };
        }
        if lower.contains("fee") || lower.contains("budget") || lower.contains("insufficient") {
            return RpcFault::Resource {
                detail: message.to_string(),
            };
        }
        if lower.contains("timeout")
            || lower.contains("connection")
            || lower.contains("reset")
            || lower.contains("transport")
            || lower.contains("unreachable")
        {
            return RpcFault::Transport {
                detail: message.to_string(),
            };
        }
        if lower.contains("rate limit") || lower.contains("too many") {
            return RpcFault::RateLimited {
                retry_after_ms: None,
            };
        }
        if lower.contains("not found") || lower.contains("archived") {
            return RpcFault::NotFound {
                detail: message.to_string(),
            };
        }
        if let Some(c) = code {
            if c == -32600 || c == -32602 {
                return RpcFault::Resource {
                    detail: message.to_string(),
                };
            }
        }
        RpcFault::Contract {
            detail: message.to_string(),
        }
    }

    /// Formats a harness_error run-state message for this fault.
    pub fn harness_message(&self) -> String {
        format!("harness_error:{}:{}", self.failure_class(), self.detail())
    }

    fn detail(&self) -> String {
        match self {
            RpcFault::Transport { detail }
            | RpcFault::Sequence { detail }
            | RpcFault::Resource { detail }
            | RpcFault::Contract { detail }
            | RpcFault::NotFound { detail } => detail.clone(),
            RpcFault::RateLimited { retry_after_ms } => {
                format!("rate_limited retry_after_ms={retry_after_ms:?}")
            }
        }
    }
}

/// Returns true when a drive-loop message is a harness error (not a crash).
pub fn is_harness_error_message(message: &str) -> bool {
    message.starts_with("harness_error:")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_maps_to_transport_leaf_and_retries() {
        let f = RpcFault::parse_envelope(None, "connection reset by peer", None);
        assert_eq!(f.failure_class(), FailureClass::RpcTransport);
        assert!(f.is_retryable());
        assert!(f.excludes_from_corpus());
    }

    #[test]
    fn rate_limit_never_enters_corpus() {
        let f = RpcFault::parse_envelope(Some(0), "x", Some(429));
        assert_eq!(f.failure_class(), FailureClass::RpcRateLimited);
        assert!(f.excludes_from_corpus());
    }

    #[test]
    fn sequence_replays_once() {
        let f = RpcFault::parse_envelope(None, "bad_seq nonce gap", None);
        assert_eq!(f.failure_class(), FailureClass::RpcSequence);
        assert!(f.is_retryable());
    }

    #[test]
    fn resource_carries_fee_detail() {
        let f = RpcFault::parse_envelope(None, "insufficient fee 100", None);
        assert_eq!(f.failure_class(), FailureClass::RpcResource);
        assert!(f.harness_message().contains("insufficient fee"));
    }

    #[test]
    fn contract_is_not_harness_excluded() {
        let f = RpcFault::parse_envelope(None, "contract trap host error", None);
        assert_eq!(f.failure_class(), FailureClass::RpcContract);
        assert!(!f.excludes_from_corpus());
    }

    #[test]
    fn not_found_maps_correctly() {
        let f = RpcFault::parse_envelope(Some(0), "x", Some(404));
        assert_eq!(f.failure_class(), FailureClass::RpcNotFound);
    }

    #[test]
    fn fault_injection_classification_retry_and_corpus_exclusion() {
        use crate::crash_index::CrashIndex;
        use crate::retry::{execute_with_retry_counting, simulation_error_for_fault, RetryConfig};
        use crate::{CaseSeed, CrashSignature};

        let cases: Vec<(Option<i64>, &str, Option<u16>, FailureClass, bool, u32)> = vec![
            (None, "connection reset", None, FailureClass::RpcTransport, true, 3),
            (None, "x", Some(429), FailureClass::RpcRateLimited, true, 3),
            (None, "bad_seq nonce", None, FailureClass::RpcSequence, false, 2),
            (None, "insufficient fee", None, FailureClass::RpcResource, false, 1),
            (None, "trap", None, FailureClass::RpcContract, false, 1),
            (None, "x", Some(404), FailureClass::RpcNotFound, false, 1),
        ];
        let config = RetryConfig {
            max_attempts: 3,
            base_delay_ms: 1,
            max_delay_ms: 2,
            jitter_factor: 0.0,
        };
        let mut index = CrashIndex::new();
        for (code, msg, status, class, excluded, expected_calls) in cases {
            let fault = RpcFault::parse_envelope(code, msg, status);
            assert_eq!(fault.failure_class(), class);
            let mut calls = 0u32;
            let mut f = || {
                calls += 1;
                if fault.is_retryable() && calls < expected_calls {
                    Err(simulation_error_for_fault(&fault))
                } else if fault.is_retryable() {
                    Ok(())
                } else {
                    Err(simulation_error_for_fault(&fault))
                }
            };
            let (res, observed) = execute_with_retry_counting(&config, None, &mut f);
            if fault.is_retryable() {
                assert!(res.is_ok());
            } else {
                assert!(res.is_err());
            }
            assert_eq!(observed, expected_calls);

            let bundle = crate::CaseBundle {
                seed: CaseSeed { id: 1, payload: vec![1] },
                signature: CrashSignature {
                    category: class.as_str().to_string(),
                    digest: 1,
                    signature_hash: 9000 + observed as u64,
                },
                environment: None,
                failure_payload: Vec::new(),
                rpc_envelope: None,
                engine_version: crate::engine_version::ENGINE_VERSION.to_string(),
            };
            let inserted = index.try_insert(bundle);
            assert_eq!(!inserted, excluded);
        }
        // Only non-excluded faults remain.
        assert_eq!(index.len(), 4);
    }
}
