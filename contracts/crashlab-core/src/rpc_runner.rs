//! RPC-based contract runner for executing seeds against a Soroban RPC endpoint.
//!
//! This module provides [`RpcContractRunner`], an implementation of [`ContractRunner`]
//! that executes contract calls against a Soroban RPC endpoint.
//!
//! # Purpose
//! The RPC runner enables testing against live or test Soroban networks without
//! requiring a local contract environment setup. It communicates with a Soroban RPC
//! endpoint to execute contract methods and capture the resulting signatures.
//!
//! # Usage
//! ```rust,no_run
//! use crashlab_core::{CaseSeed, RpcContractRunner, ContractRunner};
//!
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let mut runner = RpcContractRunner::new("https://rpc-futurenet.stellar.org:443")?;
//! let seed = CaseSeed { id: 1, payload: vec![1, 2, 3] };
//! let signature = runner.run_seed(&seed)?;
//! # Ok(())
//! # }
//! ```

use crate::{CaseSeed, CrashSignature};
use crate::runner::{RunnerError, ContractRunner};

/// Configuration error for RPC runner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RpcConfigError {
    /// The provided RPC URL is invalid or empty.
    InvalidUrl {
        /// Description of what makes the URL invalid.
        reason: String,
    },
}

impl std::fmt::Display for RpcConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RpcConfigError::InvalidUrl { reason } => {
                write!(f, "invalid RPC URL: {}", reason)
            }
        }
    }
}

impl std::error::Error for RpcConfigError {}

/// A contract runner that executes seeds against a Soroban RPC endpoint.
///
/// `RpcContractRunner` connects to a Soroban RPC endpoint and executes contract
/// calls through that endpoint. This allows testing against live or test networks.
///
/// # Configuration
/// The runner requires:
/// - An RPC URL pointing to a Soroban RPC endpoint
/// - Optional: Contract ID and network configuration
#[derive(Debug, Clone)]
pub struct RpcContractRunner {
    /// The RPC endpoint URL (e.g., "https://rpc-futurenet.stellar.org:443")
    rpc_url: String,
    /// Optional contract ID for this runner. If set, all seeds are executed
    /// against this contract. If unset, the contract ID is determined from seed.
    contract_id: Option<String>,
}

impl RpcContractRunner {
    /// Creates a new `RpcContractRunner` with the specified RPC URL.
    ///
    /// # Arguments
    /// * `rpc_url` - The URL of the Soroban RPC endpoint
    ///
    /// # Errors
    /// Returns [`RpcConfigError`] if:
    /// - The URL is empty
    /// - The URL does not start with http:// or https://
    ///
    /// # Examples
    /// ```rust,no_run
    /// # use crashlab_core::RpcContractRunner;
    /// let runner = RpcContractRunner::new("https://rpc-futurenet.stellar.org:443");
    /// assert!(runner.is_ok());
    /// ```
    pub fn new(rpc_url: impl Into<String>) -> Result<Self, RpcConfigError> {
        let url_str = rpc_url.into();
        
        // Validate URL
        if url_str.is_empty() {
            return Err(RpcConfigError::InvalidUrl {
                reason: "URL cannot be empty".to_string(),
            });
        }
        
        if !url_str.starts_with("http://") && !url_str.starts_with("https://") {
            return Err(RpcConfigError::InvalidUrl {
                reason: "URL must start with http:// or https://".to_string(),
            });
        }
        
        Ok(Self {
            rpc_url: url_str,
            contract_id: None,
        })
    }

    /// Creates a new `RpcContractRunner` configured for a specific contract.
    ///
    /// # Arguments
    /// * `rpc_url` - The URL of the Soroban RPC endpoint
    /// * `contract_id` - The Soroban contract ID to target
    ///
    /// # Examples
    /// ```rust,no_run
    /// # use crashlab_core::RpcContractRunner;
    /// let runner = RpcContractRunner::with_contract(
    ///     "https://rpc-futurenet.stellar.org:443",
    ///     "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
    /// );
    /// assert!(runner.is_ok());
    /// ```
    pub fn with_contract(
        rpc_url: impl Into<String>,
        contract_id: impl Into<String>,
    ) -> Result<Self, RpcConfigError> {
        let mut runner = Self::new(rpc_url)?;
        runner.contract_id = Some(contract_id.into());
        Ok(runner)
    }

    /// Returns the configured RPC URL.
    pub fn rpc_url(&self) -> &str {
        &self.rpc_url
    }

    /// Returns the configured contract ID, if set.
    pub fn contract_id(&self) -> Option<&str> {
        self.contract_id.as_deref()
    }

    /// Executes a seed against the RPC endpoint.
    ///
    /// This is a stub implementation that returns a placeholder signature.
    /// Future implementations will:
    /// 1. Parse the seed payload to determine the contract method
    /// 2. Build an RPC transaction
    /// 3. Send it to the RPC endpoint
    /// 4. Capture and return the resulting signature
    ///
    /// Currently returns deterministic signatures based on seed content for testing.
    fn execute_rpc(&self, seed: &CaseSeed) -> Result<CrashSignature, RunnerError> {
        // Stub implementation: return deterministic signatures
        // In a real implementation, this would:
        // 1. Use self.rpc_url to connect to the endpoint
        // 2. Build transaction payload from seed
        // 3. Execute and capture response
        // 4. Generate signature from result

        if seed.payload.is_empty() {
            return Ok(CrashSignature {
                category: "rpc-empty-payload".to_string(),
                digest: seed.id,
                signature_hash: crate::compute_signature_hash("rpc-empty-payload", &seed.payload),
            });
        }

        // Check for patterns that might indicate network/RPC errors
        if seed.payload.len() == 1 && seed.payload[0] == 0xFF {
            return Ok(CrashSignature {
                category: "rpc-potential-timeout".to_string(),
                digest: seed.id,
                signature_hash: crate::compute_signature_hash("rpc-potential-timeout", &seed.payload),
            });
        }

        // Default successful RPC execution
        Ok(CrashSignature {
            category: "rpc-success".to_string(),
            digest: seed.id,
            signature_hash: crate::compute_signature_hash("rpc-success", &seed.payload),
        })
    }
}

impl ContractRunner for RpcContractRunner {
    fn run_seed(&mut self, seed: &CaseSeed) -> Result<CrashSignature, RunnerError> {
        if self.contract_id.is_none() {
            return Err(RunnerError::Misconfigured {
                message: "RpcContractRunner requires a contract_id to be set".to_string(),
            });
        }

        self.execute_rpc(seed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rpc_runner_creation_valid_url() {
        let result = RpcContractRunner::new("https://rpc-futurenet.stellar.org:443");
        assert!(result.is_ok());
    }

    #[test]
    fn rpc_runner_creation_http_url() {
        let result = RpcContractRunner::new("http://localhost:8000");
        assert!(result.is_ok());
    }

    #[test]
    fn rpc_runner_rejects_empty_url() {
        let result = RpcContractRunner::new("");
        assert!(result.is_err());
        
        if let Err(err) = result {
            assert_eq!(
                err,
                RpcConfigError::InvalidUrl {
                    reason: "URL cannot be empty".to_string(),
                }
            );
        }
    }

    #[test]
    fn rpc_runner_rejects_invalid_scheme() {
        let result = RpcContractRunner::new("ftp://example.com");
        assert!(result.is_err());
        
        if let Err(err) = result {
            assert_eq!(
                err,
                RpcConfigError::InvalidUrl {
                    reason: "URL must start with http:// or https://".to_string(),
                }
            );
        }
    }

    #[test]
    fn rpc_runner_stores_url() {
        let url = "https://rpc-futurenet.stellar.org:443";
        let runner = RpcContractRunner::new(url).unwrap();
        assert_eq!(runner.rpc_url(), url);
    }

    #[test]
    fn rpc_runner_with_contract_stores_both() {
        let url = "https://rpc-futurenet.stellar.org:443";
        let contract_id = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
        let runner = RpcContractRunner::with_contract(url, contract_id).unwrap();
        
        assert_eq!(runner.rpc_url(), url);
        assert_eq!(runner.contract_id(), Some(contract_id));
    }

    #[test]
    fn rpc_runner_without_contract_returns_none() {
        let runner = RpcContractRunner::new("https://rpc-futurenet.stellar.org:443").unwrap();
        assert_eq!(runner.contract_id(), None);
    }

    #[test]
    fn rpc_runner_seed_execution_requires_contract_id() {
        let mut runner = RpcContractRunner::new("https://rpc-futurenet.stellar.org:443").unwrap();
        let seed = CaseSeed { id: 1, payload: vec![1, 2, 3] };

        let result = runner.run_seed(&seed);
        assert!(result.is_err());

        if let Err(err) = result {
            match err {
                RunnerError::Misconfigured { message } => {
                    assert!(message.contains("contract_id"));
                }
                _ => panic!("Expected Misconfigured error"),
            }
        }
    }

    #[test]
    fn rpc_runner_executes_seed_with_contract_id() {
        let mut runner = RpcContractRunner::with_contract(
            "https://rpc-futurenet.stellar.org:443",
            "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        ).unwrap();
        let seed = CaseSeed { id: 1, payload: vec![1, 2, 3] };

        let sig = runner.run_seed(&seed).unwrap();
        assert_eq!(sig.digest, 1);
        assert_eq!(sig.category, "rpc-success");
    }

    #[test]
    fn rpc_runner_handles_empty_payload() {
        let mut runner = RpcContractRunner::with_contract(
            "https://rpc-futurenet.stellar.org:443",
            "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        ).unwrap();
        let seed = CaseSeed { id: 2, payload: vec![] };

        let sig = runner.run_seed(&seed).unwrap();
        assert_eq!(sig.category, "rpc-empty-payload");
        assert_eq!(sig.digest, 2);
    }

    #[test]
    fn rpc_runner_handles_timeout_pattern() {
        let mut runner = RpcContractRunner::with_contract(
            "https://rpc-futurenet.stellar.org:443",
            "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        ).unwrap();
        let seed = CaseSeed { id: 3, payload: vec![0xFF] };

        let sig = runner.run_seed(&seed).unwrap();
        assert_eq!(sig.category, "rpc-potential-timeout");
        assert_eq!(sig.digest, 3);
    }

    #[test]
    fn rpc_config_error_display() {
        let err = RpcConfigError::InvalidUrl {
            reason: "URL is invalid".to_string(),
        };
        assert_eq!(err.to_string(), "invalid RPC URL: URL is invalid");
    }

    #[test]
    fn rpc_runner_url_validation_is_deterministic() {
        let url = "https://example.com/api";
        let runner1 = RpcContractRunner::new(url).unwrap();
        let runner2 = RpcContractRunner::new(url).unwrap();
        
        assert_eq!(runner1.rpc_url(), runner2.rpc_url());
    }
}
