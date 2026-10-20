//! Rust reproducer export from failing bundles (#1862).
//!
//! [`render_rust_test`] turns a [`CaseBundle`] into the source text of a single
//! `#[test]` function. The test replays the recorded seed through
//! [`HostContractRunner`](crate::HostContractRunner) and asserts the recorded
//! outcome (`signature.category`, `digest`, `signature_hash`). Output is
//! deterministic: the same bundle always renders byte-identical text.
//!
//! # What a bundle records
//!
//! A [`CaseBundle`] does not store the contract wasm, function name, call
//! arguments, auth mode, or expected host error. The invocation is reconstructed
//! from `seed.payload` by the host runner's scenario protocol, so the generated
//! test takes the wasm from the `CRASHLAB_CONTRACT_WASM` environment variable at
//! run time. `environment`, `failure_payload` and `rpc_envelope` are not emitted.
//!
//! # Verification status
//!
//! The generated text is checked by golden-string tests only. It has not been
//! compiled or executed in this module's test suite.

use crate::{CaseBundle, FailureClass};
use std::fmt;

/// Errors raised while rendering a reproducer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReproExportError {
    /// The bundle's signature category is empty, so there is no outcome to assert.
    EmptyCategory,
}

impl fmt::Display for ReproExportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ReproExportError::EmptyCategory => {
                write!(f, "bundle signature category is empty; nothing to assert")
            }
        }
    }
}

impl std::error::Error for ReproExportError {}

/// Escapes `s` as a Rust string literal, including the surrounding double quotes.
///
/// Backslash, double quote, and the control characters `\n`, `\r`, `\t`, `\0` use
/// their short escapes. Other control characters and DEL use `\u{..}`. All other
/// characters, including non-ASCII, are emitted unchanged (valid in Rust source).
pub fn escape_rust_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\0' => out.push_str("\\0"),
            c if (c as u32) < 0x20 || (c as u32) == 0x7f => {
                out.push_str(&format!("\\u{{{:x}}}", c as u32));
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Lowercases `s` and maps every character outside `[a-z0-9]` to `_`.
fn sanitize_name_part(s: &str) -> String {
    s.chars()
        .map(|c| {
            let c = c.to_ascii_lowercase();
            if c.is_ascii_lowercase() || c.is_ascii_digit() {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Deterministic test name: `crashlab_repro_<sanitized category>_<signature_hash:016x>`.
///
/// The result always matches `[a-z0-9_]+` and starts with a letter.
pub fn repro_test_name(bundle: &CaseBundle) -> String {
    format!(
        "crashlab_repro_{}_{:016x}",
        sanitize_name_part(&bundle.signature.category),
        bundle.signature.signature_hash
    )
}

/// Renders `bundle` as a cargo-test-compatible Rust source string.
///
/// The emitted file contains one `#[test]` function that:
/// 1. reads the contract wasm from `CRASHLAB_CONTRACT_WASM`,
/// 2. runs the recorded seed through `HostContractRunner::with_wasm`,
/// 3. asserts the recorded category, digest and signature hash, and, when the
///    category is a taxonomy label, the matching `FailureClass` variant.
///
/// # Errors
///
/// Returns [`ReproExportError::EmptyCategory`] when `bundle.signature.category`
/// is empty.
///
/// # Example
///
/// ```rust
/// use crashlab_core::{render_rust_test, CaseBundle, CaseSeed, CrashSignature};
///
/// let bundle = CaseBundle {
///     seed: CaseSeed { id: 1, payload: vec![0xA0] },
///     signature: CrashSignature { category: "auth".into(), digest: 9, signature_hash: 3 },
///     environment: None,
///     failure_payload: Vec::new(),
///     rpc_envelope: None,
/// };
/// let src = render_rust_test(&bundle).unwrap();
/// assert!(src.contains("fn crashlab_repro_auth_0000000000000003()"));
/// ```
pub fn render_rust_test(bundle: &CaseBundle) -> Result<String, ReproExportError> {
    let category = bundle.signature.category.as_str();
    if category.is_empty() {
        return Err(ReproExportError::EmptyCategory);
    }

    let name = repro_test_name(bundle);
    let payload = bundle
        .seed
        .payload
        .iter()
        .map(|b| format!("0x{b:02x}"))
        .collect::<Vec<_>>()
        .join(", ");
    let class_assert = match FailureClass::from_category_label(category) {
        Some(class) => format!(
            "    assert_eq!(crashlab_core::FailureClass::from_category_label(&actual.category), Some(crashlab_core::FailureClass::{class:?}));\n"
        ),
        None => String::new(),
    };

    Ok(format!(
        r#"// Generated by `crashlab bundle export-rust`. Do not edit by hand.
// Requires crashlab-core with the `host-runner` feature and CRASHLAB_CONTRACT_WASM
// set to the contract .wasm under test.

#[test]
fn {name}() {{
    use crashlab_core::{{CaseSeed, ContractRunner, HostContractRunner}};

    let wasm_path = std::env::var("CRASHLAB_CONTRACT_WASM")
        .expect("CRASHLAB_CONTRACT_WASM must point at the contract .wasm");
    let wasm = std::fs::read(&wasm_path).expect("failed to read contract wasm");

    let seed = CaseSeed {{
        id: {seed_id},
        payload: vec![{payload}],
    }};
    let mut runner = HostContractRunner::with_wasm(wasm);
    let actual = runner.run_seed(&seed).expect("recorded seed should execute");

    assert_eq!(actual.category, {category_lit});
    assert_eq!(actual.digest, {digest});
    assert_eq!(actual.signature_hash, 0x{signature_hash:016x});
{class_assert}}}
"#,
        name = name,
        seed_id = bundle.seed.id,
        payload = payload,
        category_lit = escape_rust_str(category),
        digest = bundle.signature.digest,
        signature_hash = bundle.signature.signature_hash,
        class_assert = class_assert,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CaseSeed, CrashSignature};

    fn bundle(
        id: u64,
        payload: Vec<u8>,
        category: &str,
        digest: u64,
        signature_hash: u64,
    ) -> CaseBundle {
        CaseBundle {
            seed: CaseSeed { id, payload },
            signature: CrashSignature {
                category: category.to_string(),
                digest,
                signature_hash,
            },
            environment: None,
            failure_payload: Vec::new(),
            rpc_envelope: None,
        engine_version: crate::engine_version::ENGINE_VERSION.to_string(),
        }
    }

    /// Hand-built pass bundle: host outcome `success`, no taxonomy class to assert.
    fn pass_bundle() -> CaseBundle {
        bundle(1, vec![0x01, 0x02], "success", 7, 1)
    }

    /// Hand-built panic bundle: guest abort reported as `trap`.
    fn panic_bundle() -> CaseBundle {
        bundle(2, vec![0x05], "trap", 8, 2)
    }

    /// Hand-built auth-failure bundle: taxonomy class `auth`.
    fn auth_bundle() -> CaseBundle {
        bundle(3, vec![0xA0], "auth", 9, 3)
    }

    const GOLDEN_PASS: &str = r#"// Generated by `crashlab bundle export-rust`. Do not edit by hand.
// Requires crashlab-core with the `host-runner` feature and CRASHLAB_CONTRACT_WASM
// set to the contract .wasm under test.

#[test]
fn crashlab_repro_success_0000000000000001() {
    use crashlab_core::{CaseSeed, ContractRunner, HostContractRunner};

    let wasm_path = std::env::var("CRASHLAB_CONTRACT_WASM")
        .expect("CRASHLAB_CONTRACT_WASM must point at the contract .wasm");
    let wasm = std::fs::read(&wasm_path).expect("failed to read contract wasm");

    let seed = CaseSeed {
        id: 1,
        payload: vec![0x01, 0x02],
    };
    let mut runner = HostContractRunner::with_wasm(wasm);
    let actual = runner.run_seed(&seed).expect("recorded seed should execute");

    assert_eq!(actual.category, "success");
    assert_eq!(actual.digest, 7);
    assert_eq!(actual.signature_hash, 0x0000000000000001);
}
"#;

    const GOLDEN_PANIC: &str = r#"// Generated by `crashlab bundle export-rust`. Do not edit by hand.
// Requires crashlab-core with the `host-runner` feature and CRASHLAB_CONTRACT_WASM
// set to the contract .wasm under test.

#[test]
fn crashlab_repro_trap_0000000000000002() {
    use crashlab_core::{CaseSeed, ContractRunner, HostContractRunner};

    let wasm_path = std::env::var("CRASHLAB_CONTRACT_WASM")
        .expect("CRASHLAB_CONTRACT_WASM must point at the contract .wasm");
    let wasm = std::fs::read(&wasm_path).expect("failed to read contract wasm");

    let seed = CaseSeed {
        id: 2,
        payload: vec![0x05],
    };
    let mut runner = HostContractRunner::with_wasm(wasm);
    let actual = runner.run_seed(&seed).expect("recorded seed should execute");

    assert_eq!(actual.category, "trap");
    assert_eq!(actual.digest, 8);
    assert_eq!(actual.signature_hash, 0x0000000000000002);
}
"#;

    const GOLDEN_AUTH: &str = r#"// Generated by `crashlab bundle export-rust`. Do not edit by hand.
// Requires crashlab-core with the `host-runner` feature and CRASHLAB_CONTRACT_WASM
// set to the contract .wasm under test.

#[test]
fn crashlab_repro_auth_0000000000000003() {
    use crashlab_core::{CaseSeed, ContractRunner, HostContractRunner};

    let wasm_path = std::env::var("CRASHLAB_CONTRACT_WASM")
        .expect("CRASHLAB_CONTRACT_WASM must point at the contract .wasm");
    let wasm = std::fs::read(&wasm_path).expect("failed to read contract wasm");

    let seed = CaseSeed {
        id: 3,
        payload: vec![0xa0],
    };
    let mut runner = HostContractRunner::with_wasm(wasm);
    let actual = runner.run_seed(&seed).expect("recorded seed should execute");

    assert_eq!(actual.category, "auth");
    assert_eq!(actual.digest, 9);
    assert_eq!(actual.signature_hash, 0x0000000000000003);
    assert_eq!(crashlab_core::FailureClass::from_category_label(&actual.category), Some(crashlab_core::FailureClass::Auth));
}
"#;

    // ── golden output ─────────────────────────────────────────────────────────

    #[test]
    fn golden_pass_bundle_renders_exactly() {
        assert_eq!(render_rust_test(&pass_bundle()).unwrap(), GOLDEN_PASS);
    }

    #[test]
    fn golden_panic_bundle_renders_exactly() {
        assert_eq!(render_rust_test(&panic_bundle()).unwrap(), GOLDEN_PANIC);
    }

    #[test]
    fn golden_auth_bundle_renders_exactly() {
        assert_eq!(render_rust_test(&auth_bundle()).unwrap(), GOLDEN_AUTH);
    }

    #[test]
    fn render_is_byte_identical_for_same_bundle() {
        let b = auth_bundle();
        assert_eq!(render_rust_test(&b).unwrap(), render_rust_test(&b).unwrap());
    }

    #[test]
    fn empty_payload_renders_empty_vec() {
        let b = bundle(4, vec![], "empty-input", 0, 4);
        let src = render_rust_test(&b).unwrap();
        assert!(src.contains("        payload: vec![],\n"));
    }

    // ── errors ────────────────────────────────────────────────────────────────

    #[test]
    fn empty_category_is_rejected() {
        let b = bundle(5, vec![1], "", 0, 0);
        assert_eq!(
            render_rust_test(&b).unwrap_err(),
            ReproExportError::EmptyCategory
        );
    }

    // ── escaping ──────────────────────────────────────────────────────────────

    #[test]
    fn escape_handles_quotes_backslashes_and_controls() {
        assert_eq!(
            escape_rust_str("a\"b\\c\n\r\t\0\u{1}\u{7f}"),
            r#""a\"b\\c\n\r\t\0\u{1}\u{7f}""#
        );
    }

    #[test]
    fn escape_keeps_plain_and_non_ascii_text() {
        assert_eq!(escape_rust_str("auth"), "\"auth\"");
        assert_eq!(escape_rust_str("héllo"), "\"héllo\"");
        assert_eq!(escape_rust_str(""), "\"\"");
    }

    #[test]
    fn hostile_category_cannot_break_out_of_string_literal() {
        let b = bundle(6, vec![1], "auth\"); evil(); //", 0, 6);
        let src = render_rust_test(&b).unwrap();
        // The category is emitted as a single escaped literal on one line.
        assert!(src.contains(r#"assert_eq!(actual.category, "auth\"); evil(); //");"#));
        // The test name stays a plain identifier.
        assert!(src.contains("fn crashlab_repro_auth____evil______0000000000000006()"));
    }

    // ── naming ────────────────────────────────────────────────────────────────

    #[test]
    fn test_name_is_sanitized_and_identifier_safe() {
        let b = bundle(7, vec![1], "Runtime Failure!", 0, 5);
        let name = repro_test_name(&b);
        assert_eq!(name, "crashlab_repro_runtime_failure__0000000000000005");
        assert!(name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_'));
    }

    #[test]
    fn test_name_depends_on_signature_hash() {
        let a = bundle(8, vec![1], "auth", 0, 1);
        let b = bundle(8, vec![1], "auth", 0, 2);
        assert_ne!(repro_test_name(&a), repro_test_name(&b));
    }
}
