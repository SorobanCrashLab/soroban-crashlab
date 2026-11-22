//! Integration coverage for resuming a partitioned campaign.
//!
//! The legacy modulo partition could reshuffle work when the worker count
//! changed. These tests pin the new contract: progress is recorded as coverage
//! of a fixed hash ring, so resuming — including after a resize — never
//! re-executes a covered seed and never leaves a seed unprocessed.

use crashlab_core::{
    drive_run_partitioned_from_checkpoint, CancelSignal, CaseSeed, RingCoverage, RunCheckpoint,
    RunId, RunResumeError, RunTerminalState, WorkerPartition,
};

fn seeds(n: usize) -> Vec<CaseSeed> {
    (0..n)
        .map(|i| CaseSeed {
            id: i as u64,
            payload: vec![i as u8],
        })
        .collect()
}

#[test]
fn partitioned_resume_records_coverage_without_reprocessing() {
    let seeds = seeds(12);
    let run_id = RunId(201);
    let signal = CancelSignal::new(run_id);
    // Worker 1 of 3 owns seeds [1, 2, 3, 4, 9] in 0..12 under ring partitioning.
    let partition = WorkerPartition::try_new(1, 3).expect("partition");
    let mut checkpoint = RunCheckpoint::new_run("campaign-partitioned", &seeds);

    let mut seen = Vec::new();
    let outcome = drive_run_partitioned_from_checkpoint(
        run_id,
        "campaign-partitioned",
        &mut checkpoint,
        seeds.len() as u64,
        &partition,
        &signal,
        |seed_index| {
            seen.push(seed_index);
            Ok(())
        },
    )
    .expect("resume succeeds");

    match outcome {
        RunTerminalState::Completed { summary } => {
            assert_eq!(summary.seeds_processed, 5);
            assert_eq!(summary.cancelled_at_seed, None);
        }
        other => panic!("expected completed, got {other:?}"),
    }
    assert_eq!(seen, vec![1, 2, 3, 4, 9]);
    assert_eq!(checkpoint.next_seed_index, seeds.len());
    assert!(!checkpoint.ring_coverage.is_empty());

    // The coverage survives a JSON roundtrip and prevents any re-execution.
    let bytes = crashlab_core::save_run_checkpoint_json(&checkpoint).expect("serialize");
    let mut loaded = crashlab_core::load_run_checkpoint_json(&bytes).expect("deserialize");

    let mut second_pass = Vec::new();
    let outcome = drive_run_partitioned_from_checkpoint(
        run_id,
        "campaign-partitioned",
        &mut loaded,
        seeds.len() as u64,
        &partition,
        &signal,
        |seed_index| {
            second_pass.push(seed_index);
            Ok(())
        },
    )
    .expect("second resume succeeds");

    match outcome {
        RunTerminalState::Completed { summary } => assert_eq!(summary.seeds_processed, 0),
        other => panic!("expected completed, got {other:?}"),
    }
    assert!(second_pass.is_empty(), "covered seeds must not run twice");
}

#[test]
fn v1_checkpoint_is_re_swept_conservatively_but_never_skips_a_slot() {
    // A v1 checkpoint has a cursor but no ring coverage. It must be read as
    // "nothing covered yet" and re-swept, because after a resize the cursor no
    // longer identifies which worker owns which slot.
    let v1 = br#"{
        "schema": 1,
        "campaign_id": "campaign-v1-partitioned",
        "next_seed_index": 8,
        "total_seeds": 12
    }"#;
    let mut checkpoint = crashlab_core::load_run_checkpoint_json(v1).expect("v1 loads");
    let signal = CancelSignal::new(RunId(205));
    let partition = WorkerPartition::try_new(0, 2).expect("partition");

    let mut seen = Vec::new();
    let outcome = drive_run_partitioned_from_checkpoint(
        RunId(205),
        "campaign-v1-partitioned",
        &mut checkpoint,
        12,
        &partition,
        &signal,
        |seed_index| {
            seen.push(seed_index);
            Ok(())
        },
    )
    .expect("resume succeeds");

    match outcome {
        RunTerminalState::Completed { summary } => assert_eq!(summary.seeds_processed, 7),
        other => panic!("expected completed, got {other:?}"),
    }
    // Worker 0 of 2 owns [1, 2, 7, 8, 9, 10, 11]; the stale v1 cursor is ignored.
    assert_eq!(seen, vec![1, 2, 7, 8, 9, 10, 11]);
}

#[test]
fn resize_from_two_to_three_workers_has_no_holes_or_duplicates() {
    let total = 24usize;
    let seeds = seeds(total);

    // Pass 1: two workers sharing one coverage map. Worker 0 is cancelled after
    // three seeds, worker 1 finishes, so the campaign is only partially covered.
    let mut coverage = RingCoverage::new();

    let partition0 = WorkerPartition::try_new(0, 2).expect("partition");
    let mut checkpoint0 = RunCheckpoint::new_run("campaign-resize", &seeds);
    checkpoint0.ring_coverage = coverage.clone();

    let run0 = RunId(210);
    let signal0 = CancelSignal::new(run0);
    let cancel_after_three = signal0.clone();
    let mut first_seen = Vec::new();
    let outcome = drive_run_partitioned_from_checkpoint(
        run0,
        "campaign-resize",
        &mut checkpoint0,
        total as u64,
        &partition0,
        &signal0,
        |seed_index| {
            first_seen.push(seed_index);
            if first_seen.len() == 3 {
                cancel_after_three.cancel();
            }
            Ok(())
        },
    )
    .expect("first pass validates");

    match outcome {
        RunTerminalState::Cancelled { summary } => {
            assert_eq!(summary.seeds_processed, 3);
            assert_eq!(summary.cancelled_at_seed, Some(8));
        }
        other => panic!("expected cancelled, got {other:?}"),
    }
    // Worker 0 of 2 owns [1, 2, 7, 8, 9, 10, 11, 15, 17, 19, 21, 22].
    assert_eq!(first_seen, vec![1, 2, 7]);
    coverage = checkpoint0.ring_coverage.clone();
    assert_eq!(coverage.covered_slot_count(), 3);

    let partition1 = WorkerPartition::try_new(1, 2).expect("partition");
    let mut checkpoint1 = RunCheckpoint::new_run("campaign-resize", &seeds);
    checkpoint1.ring_coverage = coverage.clone();

    let run1 = RunId(211);
    let signal1 = CancelSignal::new(run1);
    let mut second_seen = Vec::new();
    let outcome = drive_run_partitioned_from_checkpoint(
        run1,
        "campaign-resize",
        &mut checkpoint1,
        total as u64,
        &partition1,
        &signal1,
        |seed_index| {
            second_seen.push(seed_index);
            Ok(())
        },
    )
    .expect("second pass validates");

    match outcome {
        RunTerminalState::Completed { summary } => assert_eq!(summary.seeds_processed, 12),
        other => panic!("expected completed, got {other:?}"),
    }
    // Worker 1 of 2 owns the other half, including seed 0.
    assert_eq!(second_seen, vec![0, 3, 4, 5, 6, 12, 13, 14, 16, 18, 20, 23]);
    coverage = checkpoint1.ring_coverage.clone();
    assert_eq!(coverage.covered_slot_count(), 15);

    // Pass 2: scale out to three workers, resuming from the shared coverage.
    let mut resumed_seen: Vec<u64> = Vec::new();
    for (worker, expected) in [
        (0u32, vec![8u64, 10, 11, 15, 19, 21, 22]),
        (1u32, vec![9u64, 17]),
        (2u32, Vec::new()),
    ] {
        let partition = WorkerPartition::try_new(worker, 3).expect("partition");
        let mut checkpoint = RunCheckpoint::new_run("campaign-resize", &seeds);
        checkpoint.ring_coverage = coverage.clone();

        let run_id = RunId(220 + worker as u64);
        let signal = CancelSignal::new(run_id);
        let mut seen = Vec::new();
        let outcome = drive_run_partitioned_from_checkpoint(
            run_id,
            "campaign-resize",
            &mut checkpoint,
            total as u64,
            &partition,
            &signal,
            |seed_index| {
                seen.push(seed_index);
                Ok(())
            },
        )
        .expect("resized pass validates");

        match outcome {
            RunTerminalState::Completed { summary } => {
                assert_eq!(summary.seeds_processed, expected.len() as u64);
            }
            other => panic!("expected completed, got {other:?}"),
        }
        assert_eq!(
            seen, expected,
            "unexpected work for worker {worker} after resize"
        );
        resumed_seen.extend(seen);
        coverage = checkpoint.ring_coverage.clone();
    }

    // Union of both passes is exactly the schedule, with no seed executed twice.
    let mut all = first_seen;
    all.extend_from_slice(&second_seen);
    all.extend_from_slice(&resumed_seen);
    all.sort_unstable();
    let mut unique = all.clone();
    unique.dedup();
    assert_eq!(all, unique, "a seed was executed twice across the resize");
    assert_eq!(
        unique,
        (0..total as u64).collect::<Vec<u64>>(),
        "resize left a coverage hole"
    );
}

#[test]
fn resume_rejects_checkpoint_campaign_mismatch() {
    let seeds = seeds(4);
    let run_id = RunId(202);
    let signal = CancelSignal::new(run_id);
    let partition = WorkerPartition::single_worker();
    let mut checkpoint = RunCheckpoint::new_run("campaign-a", &seeds);

    let err = drive_run_partitioned_from_checkpoint(
        run_id,
        "campaign-b",
        &mut checkpoint,
        seeds.len() as u64,
        &partition,
        &signal,
        |_seed_index| Ok(()),
    )
    .expect_err("campaign mismatch should fail");

    assert!(matches!(
        err,
        RunResumeError::Checkpoint(crashlab_core::CheckpointError::CampaignMismatch { .. })
    ));
    assert_eq!(checkpoint.next_seed_index, 0);
}
