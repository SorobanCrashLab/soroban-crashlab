//! Mutation budget limiter for fuzz campaign runs.
//!
//! Caps the total number of mutation attempts per run to prevent runaway jobs.
//! When the budget is exhausted, further calls to [`MutationBudget::try_attempt`]
//! return `false` and the skipped count is incremented. Call
//! [`MutationBudget::report`] at any point to get a [`BudgetReport`] suitable
//! for dashboard and CLI output.
//!
//! # Example
//!
//! ```rust
//! use crashlab_core::mutation_budget::MutationBudget;
//!
//! let mut budget = MutationBudget::new(3);
//!
//! assert!(budget.try_attempt()); // 1
//! assert!(budget.try_attempt()); // 2
//! assert!(budget.try_attempt()); // 3 — budget exhausted after this
//! assert!(!budget.try_attempt()); // skipped
//! assert!(!budget.try_attempt()); // skipped
//!
//! let report = budget.report();
//! assert_eq!(report.budget, 3);
//! assert_eq!(report.attempts_made, 3);
//! assert_eq!(report.skipped, 2);
//! assert!(report.exhausted);
//! ```

use serde::{Deserialize, Serialize};

/// Tracks mutation attempts against a fixed per-run cap.
///
/// Construct with [`MutationBudget::new`], call [`try_attempt`][Self::try_attempt]
/// before each mutation, and retrieve results via [`report`][Self::report].
#[derive(Debug, Clone)]
pub struct MutationBudget {
    /// Maximum allowed mutation attempts for this run.
    budget: u64,
    /// Attempts that consumed budget (i.e. `try_attempt` returned `true`).
    attempts_made: u64,
    /// Attempts that were rejected because the budget was already exhausted.
    skipped: u64,
}

impl MutationBudget {
    /// Creates a new limiter with the given `budget`.
    ///
    /// A budget of `0` means every attempt is immediately skipped.
    pub fn new(budget: u64) -> Self {
        Self {
            budget,
            attempts_made: 0,
            skipped: 0,
        }
    }

    /// Returns `true` and consumes one unit of budget if budget remains.
    /// Returns `false` and increments the skipped counter otherwise.
    pub fn try_attempt(&mut self) -> bool {
        if self.attempts_made < self.budget {
            self.attempts_made += 1;
            true
        } else {
            self.skipped += 1;
            false
        }
    }

    /// Returns `true` when the budget has been fully consumed.
    pub fn is_exhausted(&self) -> bool {
        self.attempts_made >= self.budget
    }

    /// Remaining budget units (saturates at zero).
    pub fn remaining(&self) -> u64 {
        self.budget.saturating_sub(self.attempts_made)
    }

    /// Snapshot of current counters for reporting.
    pub fn report(&self) -> BudgetReport {
        BudgetReport {
            budget: self.budget,
            attempts_made: self.attempts_made,
            skipped: self.skipped,
            exhausted: self.is_exhausted(),
        }
    }
}

/// Serialisable snapshot of a [`MutationBudget`] for dashboard and CLI output.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BudgetReport {
    /// Configured cap for this run.
    pub budget: u64,
    /// Mutation attempts that were allowed through.
    pub attempts_made: u64,
    /// Attempts rejected after the budget was exhausted.
    pub skipped: u64,
    /// `true` when `attempts_made >= budget`.
    pub exhausted: bool,
}

impl BudgetReport {
    /// One-line summary for CLI output.
    ///
    /// ```text
    /// budget: 1000  used: 1000  skipped: 42  [EXHAUSTED]
    /// ```
    pub fn to_cli_line(&self) -> String {
        let tag = if self.exhausted { "  [EXHAUSTED]" } else { "" };
        format!(
            "budget: {}  used: {}  skipped: {}{}",
            self.budget, self.attempts_made, self.skipped, tag
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_attempts_up_to_budget() {
        let mut b = MutationBudget::new(5);
        for _ in 0..5 {
            assert!(b.try_attempt());
        }
        assert_eq!(b.report().attempts_made, 5);
        assert_eq!(b.report().skipped, 0);
    }

    #[test]
    fn rejects_attempts_beyond_budget() {
        let mut b = MutationBudget::new(2);
        b.try_attempt();
        b.try_attempt();
        assert!(!b.try_attempt());
        assert!(!b.try_attempt());
        assert_eq!(b.report().skipped, 2);
    }

    #[test]
    fn zero_budget_skips_all_attempts() {
        let mut b = MutationBudget::new(0);
        assert!(!b.try_attempt());
        assert!(!b.try_attempt());
        let r = b.report();
        assert_eq!(r.attempts_made, 0);
        assert_eq!(r.skipped, 2);
        assert!(r.exhausted);
    }

    #[test]
    fn is_exhausted_only_after_budget_consumed() {
        let mut b = MutationBudget::new(3);
        assert!(!b.is_exhausted());
        b.try_attempt();
        b.try_attempt();
        assert!(!b.is_exhausted());
        b.try_attempt();
        assert!(b.is_exhausted());
    }

    #[test]
    fn remaining_decrements_correctly() {
        let mut b = MutationBudget::new(4);
        assert_eq!(b.remaining(), 4);
        b.try_attempt();
        assert_eq!(b.remaining(), 3);
        b.try_attempt();
        b.try_attempt();
        b.try_attempt();
        assert_eq!(b.remaining(), 0);
        // Extra attempts don't underflow remaining.
        b.try_attempt();
        assert_eq!(b.remaining(), 0);
    }

    #[test]
    fn report_exhausted_flag_matches_state() {
        let mut b = MutationBudget::new(1);
        assert!(!b.report().exhausted);
        b.try_attempt();
        assert!(b.report().exhausted);
    }

    #[test]
    fn cli_line_includes_exhausted_tag_when_budget_spent() {
        let mut b = MutationBudget::new(2);
        b.try_attempt();
        b.try_attempt();
        b.try_attempt(); // skipped
        let line = b.report().to_cli_line();
        assert!(line.contains("EXHAUSTED"));
        assert!(line.contains("skipped: 1"));
    }

    #[test]
    fn cli_line_omits_exhausted_tag_when_budget_remains() {
        let mut b = MutationBudget::new(10);
        b.try_attempt();
        let line = b.report().to_cli_line();
        assert!(!line.contains("EXHAUSTED"));
    }

    #[test]
    fn report_is_serialisable() {
        let mut b = MutationBudget::new(5);
        b.try_attempt();
        b.try_attempt();
        let r = b.report();
        let json = serde_json::to_string(&r).unwrap();
        let back: BudgetReport = serde_json::from_str(&json).unwrap();
        assert_eq!(r, back);
    }
}
