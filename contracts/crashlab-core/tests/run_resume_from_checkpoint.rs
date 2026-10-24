use crashlab_core::{
    drive_run_from_checkpoint, load_checkpoint_file, load_run_checkpoint_json,
    save_run_checkpoint_json, verify_checkpoint_generation, write_checkpoint_file,
    CancelSignal, CaseSeed, CheckpointError, RunCheckpoint, RunId, RunTerminalState,
};
use std::path::PathBuf;

fn seeds(n: usize) -> Vec<CaseSeed> {
    (0..n)
        .map(|i| CaseSeed {
            id: i as u64,
            payload: vec![i as u8],
        })
        .collect()
}

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "crashlab-resume-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
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

#[test]
fn file_checkpoint_roundtrip_resumes_from_highest_generation() {
    let dir = temp_dir();
    let path = dir.join("checkpoint.json");
    let seeds = seeds(6);
    let mut checkpoint = RunCheckpoint::new_run("campaign-file", &seeds);
    checkpoint.advance_by(2);
    write_checkpoint_file(&path, &checkpoint, 1).expect("write gen 1");
    checkpoint.advance_by(2);
    write_checkpoint_file(&path, &checkpoint, 2).expect("write gen 2");

    let loaded = load_checkpoint_file(&path).expect("load checkpoint");
    assert_eq!(loaded.generation, 2);
    assert!(!loaded.recovered);
    assert_eq!(loaded.checkpoint.next_seed_index, 4);
    verify_checkpoint_generation(&loaded, 2).expect("generation matches");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn generation_mismatch_refuses_resume() {
    let dir = temp_dir();
    let path = dir.join("checkpoint.json");
    let seeds = seeds(4);
    let checkpoint = RunCheckpoint::new_run("campaign-gen", &seeds);
    write_checkpoint_file(&path, &checkpoint, 5).expect("write gen 5");
    let loaded = load_checkpoint_file(&path).expect("load checkpoint");
    match verify_checkpoint_generation(&loaded, 6) {
        Err(CheckpointError::GenerationMismatch { recorded, committed }) => {
            assert_eq!(recorded, 5);
            assert_eq!(committed, 6);
        }
        other => panic!("expected GenerationMismatch, got {other:?}"),
    }
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn kill_resume_loop_processes_each_seed_exactly_once() {
    let dir = temp_dir();
    let path = dir.join("checkpoint.json");
    let seeds = seeds(12);
    let run_id = RunId(999);
    let mut checkpoint = RunCheckpoint::new_run("campaign-stress", &seeds);
    write_checkpoint_file(&path, &checkpoint, 0).expect("initial write");
    let mut generation = 0u64;
    let mut seen_once = vec![false; seeds.len()];
    let mut iteration = 0;
    while iteration < 20 && !checkpoint.is_complete(&seeds) {
        let signal = CancelSignal::new(run_id);
        let cancel_after = signal.clone();
        let kill_at = (iteration + 1) % 3;
        let mut seen_this = Vec::new();
        let _ = drive_run_from_checkpoint(
            run_id,
            "campaign-stress",
            &mut checkpoint,
            seeds.len() as u64,
            &signal,
            |seed_index| {
                seen_this.push(seed_index);
                if seed_index as usize >= kill_at {
                    cancel_after.cancel();
                }
                Ok(())
            },
        );
        for idx in seen_this {
            let i = idx as usize;
            assert!(!seen_once[i], "seed {i} processed twice");
            seen_once[i] = true;
        }
        generation += 1;
        write_checkpoint_file(&path, &checkpoint, generation).expect("write checkpoint");
        let loaded = load_checkpoint_file(&path).expect("reload checkpoint");
        assert_eq!(loaded.generation, generation);
        checkpoint = loaded.checkpoint;
        iteration += 1;
    }
    assert!(checkpoint.is_complete(&seeds));
    assert!(seen_once.iter().all(|&seen| seen));
    let _ = std::fs::remove_dir_all(&dir);
}
