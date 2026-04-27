use crate::{RegressionFixture, RegressionGroup};
use std::collections::HashMap;

/// Summary of regression suite execution results, grouped by regression group.
///
/// The suite runner produces this summary after executing a set of regression fixtures.
/// It provides operators with visibility into:
/// - How many fixtures executed in each group
/// - How many passed and failed per group
/// - Overall pass/fail statistics
#[derive(Debug, Clone)]
pub struct GroupSummary {
    /// Map from regression group to execution statistics for that group.
    pub groups: HashMap<RegressionGroup, GroupStats>,
    /// Total number of fixtures executed.
    pub total_fixtures: usize,
    /// Total number of passing fixtures.
    pub total_passed: usize,
    /// Total number of failing fixtures.
    pub total_failed: usize,
}

/// Statistics for a single regression group's execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GroupStats {
    /// Regression group identifier.
    pub group: RegressionGroup,
    /// Number of fixtures in this group that were executed.
    pub count: usize,
    /// Number of fixtures in this group that passed.
    pub passed: usize,
    /// Number of fixtures in this group that failed.
    pub failed: usize,
}

impl GroupStats {
    /// Creates a new group statistics record.
    pub fn new(group: RegressionGroup, count: usize, passed: usize, failed: usize) -> Self {
        Self { group, count, passed, failed }
    }
}

impl GroupSummary {
    /// Creates an empty summary.
    pub fn new() -> Self {
        Self { groups: HashMap::new(), total_fixtures: 0, total_passed: 0, total_failed: 0 }
    }

    /// Adds a fixture result to the summary.
    ///
    /// Given a fixture and its execution outcome (passed/failed), updates the appropriate
    /// group statistics.
    pub fn add_result(&mut self, fixture: &RegressionFixture, passed: bool) {
        let group = fixture.group_or_unknown();

        let stats = self.groups.entry(group).or_insert_with(|| GroupStats::new(group, 0, 0, 0));
        stats.count += 1;
        if passed {
            stats.passed += 1;
            self.total_passed += 1;
        } else {
            stats.failed += 1;
            self.total_failed += 1;
        }
        self.total_fixtures += 1;
    }

    /// Formats the summary as a human-readable string.
    pub fn format_summary(&self) -> String {
        let mut result = format!(
            "Regression Suite Summary\n\
             ========================\n\
             Total fixtures: {}\n\
             Passed: {}\n\
             Failed: {}\n\
             \n",
            self.total_fixtures, self.total_passed, self.total_failed
        );

        result.push_str("By group:\n");
        result.push_str("─────────\n");

        let mut groups: Vec<_> = self.groups.values().collect();
        groups.sort_by_key(|g| g.group.to_stable_string());

        for stats in groups {
            result.push_str(&format!(
                "  {}: {} total, {} passed, {} failed\n",
                stats.group.to_stable_string(),
                stats.count,
                stats.passed,
                stats.failed
            ));
        }

        result
    }
}

impl Default for GroupSummary {
    fn default() -> Self {
        Self::new()
    }
}

/// Suite runner configuration for group-based fixture selection and execution.
#[derive(Debug, Clone)]
pub struct SuiteRunnerConfig {
    /// Zero or more regression groups to filter on. If empty, all groups execute.
    pub selected_groups: Vec<RegressionGroup>,
}

impl SuiteRunnerConfig {
    /// Creates a new config with no group selection (execute all fixtures).
    pub fn new() -> Self {
        Self { selected_groups: Vec::new() }
    }

    /// Creates a new config with specific group selection.
    pub fn with_groups(groups: Vec<RegressionGroup>) -> Self {
        Self { selected_groups: groups }
    }

    /// Parses group identifiers from CLI format (comma-separated stable strings).
    ///
    /// Example: `"auth#1234,state#5678"`
    pub fn from_cli_string(s: &str) -> Result<Self, String> {
        if s.trim().is_empty() {
            return Ok(Self::new());
        }

        let mut groups = Vec::new();
        for part in s.split(',') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            match RegressionGroup::from_stable_string(part) {
                Some(group) => groups.push(group),
                None => return Err(format!("Invalid group identifier: {}", part)),
            }
        }

        Ok(Self { selected_groups: groups })
    }

    /// Returns true if the fixture should be executed given the current selection.
    ///
    /// If no selection is active, returns true (execute all).
    /// Otherwise, returns true only if the fixture's group matches one of the selected groups.
    pub fn should_execute(&self, fixture: &RegressionFixture) -> bool {
        if self.selected_groups.is_empty() {
            // No selection: execute all
            return true;
        }

        let fixture_group = fixture.group_or_unknown();
        self.selected_groups.contains(&fixture_group)
    }
}

impl Default for SuiteRunnerConfig {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{FailureClass, CaseSeed, CrashSignature};

    fn make_fixture(group: Option<RegressionGroup>) -> RegressionFixture {
        let seed = CaseSeed { id: 1, payload: vec![0xA0] };
        let sig = CrashSignature {
            category: "runtime-failure".to_string(),
            digest: 0,
            signature_hash: 0x1111111111111111,
        };
        RegressionFixture::new(&seed, &sig, group)
    }

    // ── GroupSummary ─────────────────────────────────────────────────────────

    #[test]
    fn empty_summary() {
        let summary = GroupSummary::new();
        assert_eq!(summary.total_fixtures, 0);
        assert_eq!(summary.total_passed, 0);
        assert_eq!(summary.total_failed, 0);
        assert!(summary.groups.is_empty());
    }

    #[test]
    fn add_result_increments_counters() {
        let mut summary = GroupSummary::new();
        let group = RegressionGroup::new(FailureClass::Auth, 0x1111111111111111);
        let fixture = make_fixture(Some(group));

        summary.add_result(&fixture, true);

        assert_eq!(summary.total_fixtures, 1);
        assert_eq!(summary.total_passed, 1);
        assert_eq!(summary.total_failed, 0);
    }

    #[test]
    fn add_result_tracks_failures() {
        let mut summary = GroupSummary::new();
        let group = RegressionGroup::new(FailureClass::Budget, 0x2222222222222222);
        let fixture = make_fixture(Some(group));

        summary.add_result(&fixture, false);

        assert_eq!(summary.total_fixtures, 1);
        assert_eq!(summary.total_passed, 0);
        assert_eq!(summary.total_failed, 1);
    }

    #[test]
    fn multiple_results_aggregate() {
        let mut summary = GroupSummary::new();
        let group1 = RegressionGroup::new(FailureClass::Auth, 0x1111111111111111);
        let group2 = RegressionGroup::new(FailureClass::State, 0x3333333333333333);
        let f1 = make_fixture(Some(group1));
        let f2 = make_fixture(Some(group2));

        summary.add_result(&f1, true);
        summary.add_result(&f1, false);
        summary.add_result(&f2, true);

        assert_eq!(summary.total_fixtures, 3);
        assert_eq!(summary.total_passed, 2);
        assert_eq!(summary.total_failed, 1);
        assert_eq!(summary.groups.len(), 2);
    }

    #[test]
    fn format_summary_includes_totals() {
        let mut summary = GroupSummary::new();
        let group = RegressionGroup::new(FailureClass::Xdr, 0x4444444444444444);
        let f = make_fixture(Some(group));
        summary.add_result(&f, true);

        let formatted = summary.format_summary();

        assert!(formatted.contains("Total fixtures: 1"));
        assert!(formatted.contains("Passed: 1"));
        assert!(formatted.contains("Failed: 0"));
    }

    #[test]
    fn format_summary_includes_groups() {
        let mut summary = GroupSummary::new();
        let group = RegressionGroup::new(FailureClass::Budget, 0x5555555555555555);
        let f = make_fixture(Some(group));
        summary.add_result(&f, true);

        let formatted = summary.format_summary();

        assert!(formatted.contains("budget#5555555555555555"));
    }

    // ── SuiteRunnerConfig ────────────────────────────────────────────────────

    #[test]
    fn new_config_has_no_selection() {
        let config = SuiteRunnerConfig::new();
        assert!(config.selected_groups.is_empty());
    }

    #[test]
    fn with_groups_sets_selection() {
        let group = RegressionGroup::new(FailureClass::Auth, 0x1111);
        let config = SuiteRunnerConfig::with_groups(vec![group]);
        assert_eq!(config.selected_groups.len(), 1);
        assert_eq!(config.selected_groups[0], group);
    }

    #[test]
    fn from_cli_string_single_group() {
        let config = SuiteRunnerConfig::from_cli_string("auth#1234567890abcdef").unwrap();
        assert_eq!(config.selected_groups.len(), 1);
    }

    #[test]
    fn from_cli_string_multiple_groups() {
        let config =
            SuiteRunnerConfig::from_cli_string("auth#1111,state#2222,budget#3333").unwrap();
        assert_eq!(config.selected_groups.len(), 3);
    }

    #[test]
    fn from_cli_string_empty_string() {
        let config = SuiteRunnerConfig::from_cli_string("").unwrap();
        assert!(config.selected_groups.is_empty());
    }

    #[test]
    fn from_cli_string_whitespace() {
        let config = SuiteRunnerConfig::from_cli_string("   ").unwrap();
        assert!(config.selected_groups.is_empty());
    }

    #[test]
    fn from_cli_string_invalid_group() {
        let result = SuiteRunnerConfig::from_cli_string("invalid");
        assert!(result.is_err());
    }

    #[test]
    fn from_cli_string_with_spaces() {
        let config =
            SuiteRunnerConfig::from_cli_string("auth#1111 , state#2222 , budget#3333").unwrap();
        assert_eq!(config.selected_groups.len(), 3);
    }

    #[test]
    fn should_execute_no_selection() {
        let config = SuiteRunnerConfig::new();
        let group = RegressionGroup::new(FailureClass::Auth, 0x1111);
        let fixture = make_fixture(Some(group));

        assert!(config.should_execute(&fixture));
    }

    #[test]
    fn should_execute_matching_group() {
        let group = RegressionGroup::new(FailureClass::Budget, 0x2222);
        let config = SuiteRunnerConfig::with_groups(vec![group]);
        let fixture = make_fixture(Some(group));

        assert!(config.should_execute(&fixture));
    }

    #[test]
    fn should_execute_non_matching_group() {
        let selected = RegressionGroup::new(FailureClass::Auth, 0x1111);
        let fixture_group = RegressionGroup::new(FailureClass::State, 0x3333);
        let config = SuiteRunnerConfig::with_groups(vec![selected]);
        let fixture = make_fixture(Some(fixture_group));

        assert!(!config.should_execute(&fixture));
    }

    #[test]
    fn should_execute_multi_group_selection_match() {
        let group1 = RegressionGroup::new(FailureClass::Auth, 0x1111);
        let group2 = RegressionGroup::new(FailureClass::Budget, 0x2222);
        let config = SuiteRunnerConfig::with_groups(vec![group1, group2]);
        let fixture = make_fixture(Some(group2));

        assert!(config.should_execute(&fixture));
    }

    #[test]
    fn should_execute_multi_group_selection_no_match() {
        let group1 = RegressionGroup::new(FailureClass::Auth, 0x1111);
        let group2 = RegressionGroup::new(FailureClass::Budget, 0x2222);
        let group3 = RegressionGroup::new(FailureClass::State, 0x3333);
        let config = SuiteRunnerConfig::with_groups(vec![group1, group2]);
        let fixture = make_fixture(Some(group3));

        assert!(!config.should_execute(&fixture));
    }

    #[test]
    fn should_execute_unknown_group_unselected() {
        let selected = RegressionGroup::new(FailureClass::Auth, 0x1111);
        let config = SuiteRunnerConfig::with_groups(vec![selected]);
        let fixture = make_fixture(None);

        assert!(!config.should_execute(&fixture));
    }

    #[test]
    fn should_execute_unknown_group_selected() {
        // When a fixture has no group assigned, group_or_unknown() creates Unknown with the fixture's signature_hash
        let fixture_group = RegressionGroup::new(FailureClass::Unknown, 0x1111111111111111);
        let config = SuiteRunnerConfig::with_groups(vec![fixture_group]);
        let fixture = make_fixture(None);

        assert!(config.should_execute(&fixture));
    }
}
