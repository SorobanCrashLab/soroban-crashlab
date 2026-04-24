use crashlab_core::{
    drive_run_from_checkpoint, load_run_checkpoint_json, save_run_checkpoint_json, CancelSignal,
    CaseSeed, RunCheckpoint, RunId, RunTerminalState,
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
fn persisted_checkpoint_roundtrip_resumes_without_reprocessing_completed_seeds() {
    let seeds = seeds(6);
    let run_id = RunId(200);
    let mut checkpoint = RunCheckpoint::new_run("campaign-resume", &seeds);

    let first_signal = CancelSignal::new(run_id);
    let cancel_after_seed_two = first_signal.clone();
    let mut first_seen = Vec::new();
    let first_outcome = drive_run_from_checkpoint(
        run_id,
        "campaign-resume",
        &mut checkpoint,
        seeds.len() as u64,
        &first_signal,
        |seed_index| {
            first_seen.push(seed_index);
            if seed_index == 2 {
                cancel_after_seed_two.cancel();
            }
            Ok(())
        },
    )
    .expect("checkpoint validates");

    match first_outcome {
        RunTerminalState::Cancelled { summary } => {
            assert_eq!(summary.seeds_processed, 3);
            assert_eq!(summary.cancelled_at_seed, Some(3));
        }
        other => panic!("expected cancelled, got {other:?}"),
    }
    assert_eq!(checkpoint.next_seed_index, 3);
    assert_eq!(first_seen, vec![0, 1, 2]);

    let bytes = save_run_checkpoint_json(&checkpoint).expect("serialize checkpoint");
    let mut loaded = load_run_checkpoint_json(&bytes).expect("deserialize checkpoint");

    let resume_signal = CancelSignal::new(run_id);
    let mut resumed_seen = Vec::new();
    let resumed_outcome = drive_run_from_checkpoint(
        run_id,
        "campaign-resume",
        &mut loaded,
        seeds.len() as u64,
        &resume_signal,
        |seed_index| {
            resumed_seen.push(seed_index);
            Ok(())
        },
    )
    .expect("resume succeeds");

    match resumed_outcome {
        RunTerminalState::Completed { summary } => {
            assert_eq!(summary.seeds_processed, 3);
            assert_eq!(summary.cancelled_at_seed, None);
        }
        other => panic!("expected completed, got {other:?}"),
    }

    let mut combined = first_seen;
    combined.extend_from_slice(&resumed_seen);
    assert_eq!(combined, vec![0, 1, 2, 3, 4, 5]);
    assert_eq!(resumed_seen, vec![3, 4, 5]);
    assert!(loaded.is_complete(&seeds));
}
