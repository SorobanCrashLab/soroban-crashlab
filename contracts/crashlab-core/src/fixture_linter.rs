//! Fixture linting for schema validation and naming conventions.
//!
//! Validates fixture files for schema conformance, naming conventions,
//! and metadata integrity.

use std::fmt;
use regex::Regex;

/// Severity level of a linting issue.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LintLevel {
    /// Informational message.
    Info,
    /// Warning but still valid.
    Warning,
    /// Error that may cause issues.
    Error,
    /// Critical error, fixture is invalid.
    Critical,
}

impl fmt::Display for LintLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LintLevel::Info => write!(f, "info"),
            LintLevel::Warning => write!(f, "warning"),
            LintLevel::Error => write!(f, "error"),
            LintLevel::Critical => write!(f, "critical"),
        }
    }
}

/// A single linting issue found in a fixture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LintIssue {
    /// Severity of the issue.
    pub level: LintLevel,
    /// Human-readable message.
    pub message: String,
    /// Line number where the issue occurs (if applicable).
    pub line: Option<usize>,
}

/// Result of linting a fixture or fixture set.
#[derive(Debug, Clone)]
pub struct LintReport {
    /// Issues found during linting.
    pub issues: Vec<LintIssue>,
    /// Whether linting passed (no critical or error issues).
    pub passed: bool,
}

/// Error type for linter operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LinterError {
    /// Invalid fixture format.
    InvalidFormat(String),
    /// I/O error.
    Io(String),
    /// Regex compilation failed.
    RegexError(String),
}

impl fmt::Display for LinterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LinterError::InvalidFormat(msg) => write!(f, "invalid format: {msg}"),
            LinterError::Io(msg) => write!(f, "io error: {msg}"),
            LinterError::RegexError(msg) => write!(f, "regex error: {msg}"),
        }
    }
}

impl std::error::Error for LinterError {}

/// Configuration for fixture linting rules.
#[derive(Debug, Clone)]
pub struct LintConfig {
    /// Whether to require fixture IDs to follow naming convention.
    pub enforce_id_naming: bool,
    /// Pattern for valid fixture IDs (regex).
    pub id_pattern: String,
    /// Whether to require failure category.
    pub require_failure_category: bool,
    /// Whether to require checksum.
    pub require_checksum: bool,
    /// Maximum allowed fixture ID length.
    pub max_id_length: usize,
}

impl Default for LintConfig {
    fn default() -> Self {
        Self {
            enforce_id_naming: true,
            id_pattern: r"^(fix|seed|bundle|corpus)-[a-zA-Z0-9_-]+$".to_string(),
            require_failure_category: false,
            require_checksum: false,
            max_id_length: 256,
        }
    }
}

/// Fixture linter.
pub struct FixtureLinter {
    config: LintConfig,
}

impl FixtureLinter {
    /// Creates a new linter with default configuration.
    pub fn new() -> Self {
        Self {
            config: LintConfig::default(),
        }
    }

    /// Creates a linter with custom configuration.
    pub fn with_config(config: LintConfig) -> Self {
        Self { config }
    }

    /// Lints a fixture ID.
    pub fn lint_fixture_id(&self, id: &str) -> LintReport {
        let mut issues = Vec::new();

        if id.is_empty() {
            issues.push(LintIssue {
                level: LintLevel::Critical,
                message: "fixture ID cannot be empty".to_string(),
                line: None,
            });
            return LintReport {
                issues,
                passed: false,
            };
        }

        if id.len() > self.config.max_id_length {
            issues.push(LintIssue {
                level: LintLevel::Error,
                message: format!(
                    "fixture ID exceeds maximum length ({} > {})",
                    id.len(),
                    self.config.max_id_length
                ),
                line: None,
            });
        }

        if self.config.enforce_id_naming {
            if let Ok(re) = Regex::new(&self.config.id_pattern) {
                if !re.is_match(id) {
                    issues.push(LintIssue {
                        level: LintLevel::Warning,
                        message: format!(
                            "fixture ID does not follow naming convention: {} (expected pattern: {})",
                            id, self.config.id_pattern
                        ),
                        line: None,
                    });
                }
            }
        }

        let has_errors = issues.iter().any(|i| i.level >= LintLevel::Error);
        LintReport {
            issues,
            passed: !has_errors,
        }
    }

    /// Lints a fixture type.
    pub fn lint_fixture_type(&self, fixture_type: &str) -> LintReport {
        let mut issues = Vec::new();

        if !["seed", "bundle", "corpus"].contains(&fixture_type) {
            issues.push(LintIssue {
                level: LintLevel::Critical,
                message: format!(
                    "invalid fixture type: {} (must be 'seed', 'bundle', or 'corpus')",
                    fixture_type
                ),
                line: None,
            });
        }

        LintReport {
            issues: issues.clone(),
            passed: issues.is_empty(),
        }
    }

    /// Lints fixture metadata including ID and type.
    pub fn lint_metadata(
        &self,
        id: &str,
        fixture_type: &str,
        failure_category: Option<&str>,
    ) -> LintReport {
        let mut all_issues = Vec::new();

        let id_report = self.lint_fixture_id(id);
        all_issues.extend(id_report.issues);

        let type_report = self.lint_fixture_type(fixture_type);
        all_issues.extend(type_report.issues);

        if self.config.require_failure_category {
            if failure_category.is_none() || failure_category.map_or(false, |c| c.is_empty()) {
                all_issues.push(LintIssue {
                    level: LintLevel::Error,
                    message: "failure_category is required but missing".to_string(),
                    line: None,
                });
            }
        }

        let has_errors = all_issues.iter().any(|i| i.level >= LintLevel::Error);
        LintReport {
            issues: all_issues,
            passed: !has_errors,
        }
    }

    /// Detects duplicate IDs in a fixture collection.
    pub fn check_duplicate_ids(&self, ids: &[&str]) -> LintReport {
        use std::collections::HashSet;

        let mut issues = Vec::new();
        let mut seen = HashSet::new();

        for id in ids {
            if seen.contains(id) {
                issues.push(LintIssue {
                    level: LintLevel::Critical,
                    message: format!("duplicate fixture ID: {}", id),
                    line: None,
                });
            }
            seen.insert(id);
        }

        LintReport {
            issues: issues.clone(),
            passed: issues.is_empty(),
        }
    }
}

impl Default for FixtureLinter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_id() {
        let linter = FixtureLinter::new();
        let report = linter.lint_fixture_id("");
        assert!(!report.passed);
        assert_eq!(report.issues[0].level, LintLevel::Critical);
    }

    #[test]
    fn test_valid_id() {
        let linter = FixtureLinter::new();
        let report = linter.lint_fixture_id("fix-test-001");
        assert!(report.passed);
    }

    #[test]
    fn test_id_naming_convention() {
        let linter = FixtureLinter::new();
        
        let valid_patterns = vec![
            "fix-test",
            "seed-crash-001",
            "bundle-regression",
            "corpus-v1_2_3",
            "fix-test-with-many-dashes",
        ];

        for id in valid_patterns {
            let report = linter.lint_fixture_id(id);
            assert!(
                report.passed,
                "ID '{}' should be valid but got issues: {:?}",
                id,
                report.issues
            );
        }
    }

    #[test]
    fn test_id_too_long() {
        let config = LintConfig {
            max_id_length: 10,
            ..Default::default()
        };
        let linter = FixtureLinter::with_config(config);
        let report = linter.lint_fixture_id("this-is-a-very-long-fixture-id");
        assert!(!report.passed);
    }

    #[test]
    fn test_fixture_type_validation() {
        let linter = FixtureLinter::new();
        
        assert!(linter.lint_fixture_type("seed").passed);
        assert!(linter.lint_fixture_type("bundle").passed);
        assert!(linter.lint_fixture_type("corpus").passed);
        assert!(!linter.lint_fixture_type("invalid").passed);
    }

    #[test]
    fn test_duplicate_ids() {
        let linter = FixtureLinter::new();
        let ids = vec!["fix-001", "fix-002", "fix-001"];
        let report = linter.check_duplicate_ids(&ids);
        assert!(!report.passed);
        assert_eq!(report.issues.len(), 1);
        assert_eq!(report.issues[0].level, LintLevel::Critical);
    }

    #[test]
    fn test_metadata_linting() {
        let linter = FixtureLinter::new();
        let report = linter.lint_metadata("fix-001", "seed", Some("Panic"));
        assert!(report.passed);
    }

    #[test]
    fn test_metadata_linting_missing_category() {
        let config = LintConfig {
            require_failure_category: true,
            ..Default::default()
        };
        let linter = FixtureLinter::with_config(config);
        let report = linter.lint_metadata("fix-001", "seed", None);
        assert!(!report.passed);
    }
}
