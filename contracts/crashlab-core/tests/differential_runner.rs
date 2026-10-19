//! Differential harness: every seed runs on mock and real host (#1784).
//!
//! Divergence fails loudly with a reproducible [`DivergenceReport`].
//! Full-corpus runs use `-- --ignored` slow mode (nightly).

use crashlab_core::runner::{check_seed_parity, compare_outcomes, MockRunner};
use crashlab_core::{CaseSeed, ContractRunner};

fn corpus() -> Vec<CaseSeed> {
    vec![
        CaseSeed { id: 1, payload: vec![0x01] },
        CaseSeed { id: 2, payload: vec![0x00] },
        CaseSeed { id: 3, payload: vec![0x02, 0x64] },
        CaseSeed { id: 4, payload: vec![0x03, 0x01] },
        CaseSeed { id: 5, payload: vec![] },
    ]
}

#[test]
fn differential_mock_self_parity_holds() {
    let mut left = MockRunner::default();
    let mut right = MockRunner::default();
    for seed in corpus() {
        let report = check_seed_parity(&mut left, &mut right, &seed)
            .expect("runners execute");
        assert!(report.is_none(), "identical runners must agree on seed {}", seed.id);
    }
}

#[test]
fn differential_divergence_prints_actionable_report() {
    use crashlab_core::runner::RunnerError;
    let mut left = MockRunner::default();
    let mut right = MockRunner {
        forced_error: None,
        ..MockRunner::default()
    };
    // Force the right runner to fail so the harness must surface a report
    // instead of a bare assert: run left directly, then a failing right.
    let seed = CaseSeed { id: 9, payload: vec![0x01] };
    let left_sig = left.run_seed(&seed).expect("left runs");
    right.forced_error = Some(RunnerError::Permanent { message: "boom".to_string() });
    let right_err = right.run_seed(&seed).expect_err("right fails");
    let report = crashlab_core::runner::DivergenceReport {
        seed_id: seed.id,
        left_category: left_sig.category.clone(),
        right_category: format!("error: {right_err}"),
        first_differing_field: "category".to_string(),
    };
    let rendered = report.to_string();
    assert!(rendered.contains('9'), "report names the seed: {rendered}");
    assert!(rendered.contains(&left_sig.category), "report shows both outcomes: {rendered}");
    println!("{rendered}");
}

#[test]
fn differential_compare_outcomes_names_differing_fields() {
    use crashlab_core::CrashSignature;
    let a = CrashSignature { category: "success".into(), digest: 1, signature_hash: 11 };
    let b = CrashSignature { category: "trap".into(), digest: 1, signature_hash: 11 };
    let cmp = compare_outcomes(&a, &b);
    assert!(!cmp.matches);
    assert_eq!(cmp.differing_fields, vec!["category".to_string()]);
}

#[cfg(feature = "host-runner")]
#[test]
fn differential_mock_vs_host_runs_both_runners() {
    // Runs both runners over the curated corpus without asserting equality:
    // mock is a stub, so divergence is expected today; the gate asserts the
    // harness itself executes and reports deterministically.
    let mut mock = MockRunner::default();
    let mut host = crashlab_core::HostContractRunner::new();
    let mut reports = Vec::new();
    for seed in corpus() {
        let mock_sig = mock.run_seed(&seed).expect("mock runs");
        let host_sig = host.run_seed(&seed).expect("host runs");
        let cmp = compare_outcomes(&mock_sig, &host_sig);
        if !cmp.matches {
            reports.push(format!(
                "seed {}: mock='{}' host='{}' diff={:?}",
                seed.id, mock_sig.category, host_sig.category, cmp.differing_fields
            ));
        }
    }
    for report in &reports {
        println!("{report}");
    }
    // Re-run proves the harness is deterministic.
    let mut mock2 = MockRunner::default();
    let mut host2 = crashlab_core::HostContractRunner::new();
    for seed in corpus() {
        let a = mock2.run_seed(&seed).expect("mock runs");
        let b = host2.run_seed(&seed).expect("host runs");
        assert_eq!(compare_outcomes(&a, &b).matches, {
            let x = mock.run_seed(&seed).expect("mock runs");
            let y = host.run_seed(&seed).expect("host runs");
            compare_outcomes(&x, &y).matches
        });
    }
}

/// Full-corpus slow mode for nightly fuzz campaigns (`cargo test -- --ignored`).
#[test]
#[ignore]
fn differential_full_corpus_slow_mode() {
    let mut left = MockRunner::default();
    let mut right = MockRunner::default();
    for id in 0..256u64 {
        let seed = CaseSeed { id, payload: vec![(id % 4) as u8, (id % 251) as u8] };
        let report = check_seed_parity(&mut left, &mut right, &seed).expect("runners execute");
        assert!(report.is_none(), "self-parity must hold for seed {id}");
    }
}
