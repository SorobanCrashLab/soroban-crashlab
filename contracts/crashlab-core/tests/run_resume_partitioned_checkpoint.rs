use crashlab_core::{
    drive_run_partitioned_from_checkpoint, CancelSignal, CaseSeed, RunCheckpoint, RunId,
    RunResumeError, RunTerminalState, WorkerPartition,
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
fn partitioned_resume_advances_global_cursor_without_reprocessing() {
    let seeds = seeds(8);
    let run_id = RunId(201);
    let signal = CancelSignal::new(run_id);
    let partition = WorkerPartition::try_new(1, 3).expect("partition");
    let mut checkpoint = RunCheckpoint::new_run("campaign-partitioned", &seeds);
    checkpoint.advance_by(2);

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
            assert_eq!(summary.seeds_processed, 2);
            assert_eq!(summary.cancelled_at_seed, None);
        }
        other => panic!("expected completed, got {other:?}"),
    }

    assert_eq!(seen, vec![4, 7]);
    assert_eq!(checkpoint.next_seed_index, seeds.len());
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
