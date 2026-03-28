//! Automatic grouping of exported regression fixtures by **domain risk** ([`FailureClass`])
//! and **expected failure mode** (`CaseBundle::signature::category`).
//!
//! Grouped suites emit one Rust submodule per group so `cargo test <suite>::<group>` runs only
//! that slice — see [`export_rust_regression_suite`].

use crate::CaseBundle;
use crate::scenario_export::format_rust_regression_test_fn;
use crate::taxonomy::{FailureClass, classify_failure};
use std::cmp::Ordering;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

/// Stable key for a regression group: taxonomy domain + exported signature category.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct RegressionGroupKey {
    /// Risk domain inferred from the (mutated) seed payload via [`classify_failure`].
    pub domain: FailureClass,
    /// Expected failure mode from the bundle signature (e.g. `runtime-failure`, `empty-input`).
    pub failure_mode: String,
}

impl Hash for RegressionGroupKey {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.domain.hash(state);
        self.failure_mode.hash(state);
    }
}

impl PartialOrd for RegressionGroupKey {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for RegressionGroupKey {
    fn cmp(&self, other: &Self) -> Ordering {
        let ai = FailureClass::ALL
            .iter()
            .position(|c| *c == self.domain)
            .unwrap_or(usize::MAX);
        let bi = FailureClass::ALL
            .iter()
            .position(|c| *c == other.domain)
            .unwrap_or(usize::MAX);
        ai.cmp(&bi)
            .then_with(|| self.failure_mode.cmp(&other.failure_mode))
    }
}

/// Derives the regression group for a bundle.
pub fn regression_group_key(bundle: &CaseBundle) -> RegressionGroupKey {
    RegressionGroupKey {
        domain: classify_failure(&bundle.seed),
        failure_mode: bundle.signature.category.clone(),
    }
}

fn sanitize_ident_segment(label: &str) -> String {
    let mut s: String = label
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c
            } else if c == '-' || c == '.' {
                '_'
            } else {
                '_'
            }
        })
        .collect();
    s = s.trim_matches('_').to_string();
    if s.is_empty() {
        s = "unknown".into();
    }
    if s.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        s = format!("_{s}");
    }
    s
}

/// Rust `mod` name for `key`, stable and unique per [`RegressionGroupKey`].
///
/// Example: domain `auth` + mode `runtime-failure` → `regression_auth_runtime_failure`.
pub fn regression_group_module_ident(key: &RegressionGroupKey) -> String {
    format!(
        "regression_{}_{}",
        sanitize_ident_segment(key.domain.as_str()),
        sanitize_ident_segment(&key.failure_mode)
    )
}

/// Partitions bundles into regression groups (input order preserved within each group).
pub fn group_bundles_by_regression_group(
    bundles: &[CaseBundle],
) -> HashMap<RegressionGroupKey, Vec<&CaseBundle>> {
    let mut map: HashMap<RegressionGroupKey, Vec<&CaseBundle>> = HashMap::new();
    for b in bundles {
        map.entry(regression_group_key(b)).or_default().push(b);
    }
    map
}

/// Sorted group keys for deterministic suite emission and reporting.
pub fn regression_group_keys_sorted(bundles: &[CaseBundle]) -> Vec<RegressionGroupKey> {
    let mut keys: Vec<RegressionGroupKey> = bundles.iter().map(regression_group_key).collect();
    keys.sort();
    keys.dedup();
    keys
}

fn default_test_name(bundle: &CaseBundle) -> String {
    format!("regression_seed_{}", bundle.seed.id)
}

/// Exports a full regression test file: nested `pub mod` per group so each group runs alone.
///
/// Layout (example):
///
/// ```text
/// pub mod my_contract_regression {
///     pub mod regression_auth_runtime_failure {
///         #[test] fn regression_seed_1() { ... }
///     }
///     pub mod regression_xdr_empty_input {
///         #[test] fn regression_seed_2() { ... }
///     }
/// }
/// ```
///
/// Run one group: `cargo test my_contract_regression::regression_auth_runtime_failure`
/// (from a crate that includes this snippet under `tests/` or `src/…`).
pub fn export_rust_regression_suite(root_module: &str, bundles: &[CaseBundle]) -> Result<String, String> {
    if !is_valid_rust_ident(root_module) {
        return Err(
            "invalid root module name: must be a Rust identifier (a-z, A-Z, 0-9, _)".into(),
        );
    }
    if bundles.is_empty() {
        return Ok(format!(
            r#"//! Auto-generated regression suite (empty).

pub mod {root_module} {{}}
"#,
            root_module = root_module
        ));
    }

    let grouped = group_bundles_by_regression_group(bundles);
    let mut keys: Vec<_> = grouped.keys().cloned().collect();
    keys.sort();

    let mut out = String::new();
    out.push_str(
        "//! Auto-generated regression suite — grouped by domain risk ([`FailureClass`]) and expected failure mode (`signature.category`).\n\
//! Run a single group: `cargo test ",
    );
    out.push_str(root_module);
    out.push_str("::regression_<domain>_<mode>`\n\n");

    out.push_str("pub mod ");
    out.push_str(root_module);
    out.push_str(" {\n");

    for key in &keys {
        let bundles_in_group = grouped.get(key).expect("key from grouped");
        let mod_name = regression_group_module_ident(key);
        if !is_valid_rust_ident(&mod_name) {
            return Err(format!("generated invalid module ident: {mod_name}"));
        }

        out.push_str("    pub mod ");
        out.push_str(&mod_name);
        out.push_str(" {\n");

        for bundle in bundles_in_group {
            let test_name = default_test_name(bundle);
            let block = format_rust_regression_test_fn(bundle, &test_name)?;
            for line in block.lines() {
                out.push_str("        ");
                out.push_str(line);
                out.push('\n');
            }
            out.push('\n');
        }

        out.push_str("    }\n\n");
    }

    out.push_str("}\n");
    Ok(out)
}

fn is_valid_rust_ident(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first == '_' || first.is_ascii_alphabetic()) {
        return false;
    }
    chars.all(|c| c == '_' || c.is_ascii_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CaseBundle, CaseSeed, classify, to_bundle};

    #[test]
    fn key_orders_domain_then_mode() {
        let a = RegressionGroupKey {
            domain: FailureClass::Auth,
            failure_mode: "runtime-failure".into(),
        };
        let b = RegressionGroupKey {
            domain: FailureClass::Xdr,
            failure_mode: "empty-input".into(),
        };
        assert!(a < b);
    }

    fn bundle_from_seed(seed: CaseSeed) -> CaseBundle {
        CaseBundle {
            signature: classify(&seed),
            seed,
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        }
    }

    #[test]
    fn group_bundles_splits_by_domain_and_category() {
        let b1 = bundle_from_seed(CaseSeed {
            id: 1,
            payload: vec![0xA0, 1],
        });
        let b2 = bundle_from_seed(CaseSeed {
            id: 2,
            payload: vec![0xA1, 2],
        });
        let b3 = bundle_from_seed(CaseSeed {
            id: 3,
            payload: vec![],
        });

        let k1 = regression_group_key(&b1);
        let k2 = regression_group_key(&b2);
        assert_eq!(k1.domain, FailureClass::Auth);
        assert_eq!(k2.domain, FailureClass::Auth);
        assert_eq!(k1.failure_mode, b1.signature.category);

        let empty = bundle_from_seed(CaseSeed {
            id: 4,
            payload: vec![],
        });
        let ke = regression_group_key(&empty);
        assert_eq!(ke.domain, FailureClass::EmptyInput);
        assert_eq!(ke.failure_mode, "empty-input");

        let bundles = [b1, b2, b3, empty];
        let map = group_bundles_by_regression_group(&bundles);
        assert_eq!(map.len(), 2);
        let auth_rt = RegressionGroupKey {
            domain: FailureClass::Auth,
            failure_mode: "runtime-failure".into(),
        };
        assert_eq!(map.get(&auth_rt).map(|v| v.len()), Some(2));
    }

    #[test]
    fn suite_export_contains_root_and_group_modules() {
        let b1 = to_bundle(CaseSeed {
            id: 10,
            payload: vec![0x10],
        });
        let b2 = to_bundle(CaseSeed {
            id: 11,
            payload: vec![],
        });

        let m1 = regression_group_module_ident(&regression_group_key(&b1));
        let m2 = regression_group_module_ident(&regression_group_key(&b2));

        let src = export_rust_regression_suite("fixture_suite", &[b1, b2]).unwrap();
        assert!(src.contains("pub mod fixture_suite"));
        assert!(src.contains(&format!("pub mod {m1}")));
        assert!(src.contains(&format!("pub mod {m2}")));
        assert!(src.contains("fn regression_seed_10"));
        assert!(src.contains("fn regression_seed_11"));
    }

    #[test]
    fn suite_export_rejects_bad_root_module() {
        let b = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1],
        });
        assert!(export_rust_regression_suite("bad name", &[b]).is_err());
    }

    #[test]
    fn empty_pack_emits_empty_module() {
        let s = export_rust_regression_suite("empty_root", &[]).unwrap();
        assert!(s.contains("pub mod empty_root {}"));
    }

    #[test]
    fn module_ident_matches_domain_and_mode() {
        let k = RegressionGroupKey {
            domain: FailureClass::Budget,
            failure_mode: "runtime-failure".into(),
        };
        assert_eq!(
            regression_group_module_ident(&k),
            "regression_budget_runtime_failure"
        );
    }
}
