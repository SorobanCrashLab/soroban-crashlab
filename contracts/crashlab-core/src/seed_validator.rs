use crate::CaseSeed;

/// Schema for validating fuzzing seeds before execution.
///
/// Ensures seeds meet the technical requirements of the Soroban CrashLab
/// fuzzer, such as payload size limits and ID ranges.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SeedSchema {
    pub min_payload_len: usize,
    pub max_payload_len: usize,
    pub min_id: u64,
    pub max_id: u64,
    /// If true, payloads must not be entirely composed of the same byte.
    pub require_entropy: bool,
}

impl Default for SeedSchema {
    fn default() -> Self {
        Self {
            min_payload_len: 1,
            max_payload_len: 64,
            min_id: 0,
            max_id: u64::MAX,
            require_entropy: false,
        }
    }
}

impl SeedSchema {
    pub fn new(min_payload_len: usize, max_payload_len: usize, min_id: u64, max_id: u64) -> Self {
        Self {
            min_payload_len,
            max_payload_len,
            min_id,
            max_id,
            require_entropy: false,
        }
    }

    pub fn with_payload_bounds(min: usize, max: usize) -> Self {
        Self::new(min, max, 0, u64::MAX)
    }

    pub fn with_id_bounds(min: u64, max: u64) -> Self {
        Self::new(0, 64, min, max)
    }

    pub fn strict() -> Self {
        Self {
            min_payload_len: 1,
            max_payload_len: 128,
            min_id: 1,
            max_id: u64::MAX - 1,
            require_entropy: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum SeedValidationError {
    PayloadTooShort { actual: usize, minimum: usize },
    PayloadTooLong { actual: usize, maximum: usize },
    IdTooSmall { actual: u64, minimum: u64 },
    IdTooLarge { actual: u64, maximum: u64 },
    InsufficientEntropy { payload_len: usize },
    MalformedEncoding { message: String },
}

impl std::fmt::Display for SeedValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SeedValidationError::PayloadTooShort { actual, minimum } => {
                write!(
                    f,
                    "payload too short: {} bytes, minimum {}",
                    actual, minimum
                )
            }
            SeedValidationError::PayloadTooLong { actual, maximum } => {
                write!(f, "payload too long: {} bytes, maximum {}", actual, maximum)
            }
            SeedValidationError::IdTooSmall { actual, minimum } => {
                write!(f, "id too small: {}, minimum {}", actual, minimum)
            }
            SeedValidationError::IdTooLarge { actual, maximum } => {
                write!(f, "id too large: {}, maximum {}", actual, maximum)
            }
            SeedValidationError::InsufficientEntropy { payload_len } => {
                write!(f, "insufficient entropy for {} byte payload", payload_len)
            }
            SeedValidationError::MalformedEncoding { message } => {
                write!(f, "malformed encoding: {}", message)
            }
        }
    }
}

impl std::error::Error for SeedValidationError {}

pub trait Validate {
    /// Validates the object against a schema, returning all errors found.
    fn validate(&self, schema: &SeedSchema) -> Result<(), Vec<SeedValidationError>>;
}

impl Validate for CaseSeed {
    fn validate(&self, schema: &SeedSchema) -> Result<(), Vec<SeedValidationError>> {
        let mut errors = Vec::new();

        if self.payload.len() < schema.min_payload_len {
            errors.push(SeedValidationError::PayloadTooShort {
                actual: self.payload.len(),
                minimum: schema.min_payload_len,
            });
        }

        if self.payload.len() > schema.max_payload_len {
            errors.push(SeedValidationError::PayloadTooLong {
                actual: self.payload.len(),
                maximum: schema.max_payload_len,
            });
        }

        if self.id < schema.min_id {
            errors.push(SeedValidationError::IdTooSmall {
                actual: self.id,
                minimum: schema.min_id,
            });
        }

        if self.id > schema.max_id {
            errors.push(SeedValidationError::IdTooLarge {
                actual: self.id,
                maximum: schema.max_id,
            });
        }

        if schema.require_entropy && self.payload.len() > 1 {
            let first = self.payload[0];
            if self.payload.iter().all(|&b| b == first) {
                errors.push(SeedValidationError::InsufficientEntropy {
                    payload_len: self.payload.len(),
                });
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
}

/// Validates a single seed against the default schema.
pub fn validate_seed(seed: &CaseSeed) -> Result<(), Vec<SeedValidationError>> {
    seed.validate(&SeedSchema::default())
}

/// Validates a list of seeds against a schema.
pub fn validate_seeds(seeds: &[CaseSeed], schema: &SeedSchema) -> Result<(), (usize, u64, Vec<SeedValidationError>)> {
    for (i, seed) in seeds.iter().enumerate() {
        if let Err(errors) = seed.validate(schema) {
            return Err((i, seed.id, errors));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_schema_accepts_valid_seed() {
        let seed = CaseSeed {
            id: 42,
            payload: vec![1, 2, 3, 4],
        };
        assert!(seed.validate(&SeedSchema::default()).is_ok());
    }

    #[test]
    fn default_schema_rejects_empty_payload() {
        let seed = CaseSeed {
            id: 1,
            payload: vec![],
        };
        let result = seed.validate(&SeedSchema::default());
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors.contains(&SeedValidationError::PayloadTooShort {
            actual: 0,
            minimum: 1
        }));
    }

    #[test]
    fn strict_schema_rejects_low_entropy_payload() {
        let schema = SeedSchema::strict();
        let seed = CaseSeed {
            id: 10,
            payload: vec![0xAA; 16],
        };
        let result = seed.validate(&schema);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors.contains(&SeedValidationError::InsufficientEntropy {
            payload_len: 16
        }));
    }

    #[test]
    fn strict_schema_accepts_high_entropy_payload() {
        let schema = SeedSchema::strict();
        let seed = CaseSeed {
            id: 10,
            payload: vec![0, 1, 0, 1, 0, 1],
        };
        assert!(seed.validate(&schema).is_ok());
    }

    #[test]
    fn validate_seeds_returns_error_details() {
        let schema = SeedSchema::default();
        let seeds = vec![
            CaseSeed { id: 1, payload: vec![1] },
            CaseSeed { id: 2, payload: vec![] }, // Invalid
        ];
        let result = validate_seeds(&seeds, &schema);
        assert!(result.is_err());
        let (index, id, errors) = result.unwrap_err();
        assert_eq!(index, 1);
        assert_eq!(id, 2);
        assert_eq!(errors.len(), 1);
    }
}
