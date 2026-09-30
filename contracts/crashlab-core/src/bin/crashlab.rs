//! CrashLab CLI — campaign control helpers for operators.
//!
//! Run `crashlab run start` to launch a fuzz campaign, `crashlab run cancel <id>`
//! to request cooperative cancellation for the campaign identified by `id`,
//! `crashlab runs status <id>` to read the latest health snapshot a campaign
//! wrote, `crashlab replay seed <bundle.json>` to replay one persisted seed
//! bundle end to end, or `crashlab regression-suite <path>` to run all
//! regression fixtures from a file or directory.
//!
//! See `docs/RUN_LIFECYCLE.md` for the start → checkpoint → resume → cancel
//! lifecycle and ADR-0008 for the design rationale.

use crashlab_core::{
    CaseSeed, HealthMonitor, MutationBudget, RunId, RunTerminalState,
    RUN_CHECKPOINT_SCHEMA_VERSION, CampaignPreset, CancelSignal, SeededPrng, WorkerPartition,
    cancel_marker_path, cancel_requested, create_runner, default_state_dir, drive_run,
    drive_run_from_checkpoint, drive_run_partitioned_from_checkpoint, load_run_checkpoint_json,
    read_latest_health_snapshot, replay_mismatch_message, replay_seed_bundle_path,
    replay_success_message, request_cancel_run, run_regression_suite_from_json,
    save_run_checkpoint_json,
    HealthSnapshot, HealthStatus, RetentionPolicy, RetentionRecord, LocalArtifactStore,
    ArtifactStore, RunCheckpoint, CaseBundleDocument,
};
use crashlab_core::worker_partition::RingCoverage;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

fn main() {
    env_logger::init();
    let mut args = std::env::args();
    let _prog = args.next();

    let a = args.next();
    let b = args.next();

    // `run start` is the one flag-driven subcommand, so it is dispatched before
    // positional arity is resolved: everything after `run start` is an option,
    // not a third and fourth positional argument.
    if a.as_deref() == Some("run") && b.as_deref() == Some("start") {
        // Option values are bare words (`--preset smoke`), so arity cannot be
        // checked here; `parse_run_start_options` rejects anything unknown.
        let rest: Vec<String> = args.collect();
        run_start_command(&rest);
        return;
    }

    let c = args.next();
    let d = args.next();

    // Trailing arguments for the positional subcommands, which take none.
    let rest: Vec<String> = args.collect();

    match (a.as_deref(), b.as_deref(), c.as_deref(), d.as_deref()) {
        (Some("run"), Some("cancel"), Some(id_str), None) => {
            if !rest.is_empty() {
                print_usage();
                std::process::exit(1);
            }
            let id: u64 = match id_str.parse() {
                Ok(v) => v,
                Err(_) => {
                    eprintln!("invalid run id: {id_str}");
                    std::process::exit(1);
                }
            };
            let base = default_state_dir();
            let run_id = RunId(id);
            match request_cancel_run(run_id, &base) {
                Ok(()) => {
                    let path = cancel_marker_path(run_id, &base);
                    println!("cancel requested for run {id} ({})", path.display());
                }
                Err(e) => {
                    eprintln!("failed to request cancel: {e}");
                    std::process::exit(1);
                }
            }
        }
        (Some("replay"), Some("seed"), Some(path), None) => {
            if !rest.is_empty() {
                print_usage();
                std::process::exit(1);
            }

            match replay_seed_bundle_path(path) {
                Ok(result) if result.matches => {
                    println!("{}", replay_success_message(&result));
                }
                Ok(result) => {
                    eprintln!("{}", replay_mismatch_message(&result));
                    std::process::exit(1);
                }
                Err(err) => {
                    eprintln!("{err}");
                    std::process::exit(1);
                }
            }
        }
        (Some("regression-suite"), Some(path), None, None) => {
            if !rest.is_empty() {
                print_usage();
                std::process::exit(1);
            }
            run_regression_suite_command(path);
        }
        (Some("runs"), Some("list"), None, None) => {
            if !rest.is_empty() {
                print_usage();
                std::process::exit(1);
            }
            list_runs();
        }
        (Some("runs"), Some("status"), Some(id_str), flag)
            if flag.is_none() || flag == Some("--json") =>
        {
            if !rest.is_empty() {
                print_usage();
                std::process::exit(1);
            }
            let id: u64 = match id_str.parse() {
                Ok(v) => v,
                Err(_) => {
                    eprintln!("invalid run id: {id_str}");
                    std::process::exit(1);
                }
            };
            report_run_status(id, flag == Some("--json"));
        }
        (Some("retention"), Some("sweep"), extra1, extra2) => {
            let mut remaining_args: Vec<String> = Vec::new();
            if let Some(e1) = extra1 {
                remaining_args.push(e1.to_string());
            }
            if let Some(e2) = extra2 {
                remaining_args.push(e2.to_string());
            }
            remaining_args.extend(rest);

            let mut dry_run = std::env::var("CRASHLAB_SWEEP_DRY_RUN")
                .map(|v| v == "1" || v == "true")
                .unwrap_or(false);
            let mut heartbeat_ttl_secs: Option<i64> = std::env::var("CRASHLAB_HEARTBEAT_TTL_SECS")
                .ok()
                .and_then(|v| v.parse().ok());
            let mut grace_period_secs: i64 = std::env::var("CRASHLAB_SWEEP_GRACE_PERIOD_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);

            let mut iter = remaining_args.into_iter();
            while let Some(arg) = iter.next() {
                match arg.as_str() {
                    "--dry-run" => dry_run = true,
                    "--heartbeat-ttl" => {
                        if let Some(val) = iter.next() {
                            match val.parse::<i64>() {
                                Ok(v) => heartbeat_ttl_secs = Some(v),
                                Err(_) => {
                                    eprintln!("invalid heartbeat-ttl value: {val}");
                                    std::process::exit(1);
                                }
                            }
                        } else {
                            eprintln!("missing value for --heartbeat-ttl");
                            std::process::exit(1);
                        }
                    }
                    "--grace-period" => {
                        if let Some(val) = iter.next() {
                            match val.parse::<i64>() {
                                Ok(v) => grace_period_secs = v,
                                Err(_) => {
                                    eprintln!("invalid grace-period value: {val}");
                                    std::process::exit(1);
                                }
                            }
                        } else {
                            eprintln!("missing value for --grace-period");
                            std::process::exit(1);
                        }
                    }
                    _ => {
                        print_usage();
                        std::process::exit(1);
                    }
                }
            }

            let mut policy = RetentionPolicy::default();
            if let Some(ttl) = heartbeat_ttl_secs {
                policy.heartbeat_ttl = Some(chrono::Duration::seconds(ttl));
            }
            policy.sweep_grace_period = chrono::Duration::seconds(grace_period_secs);

            sweep_retention(&policy, dry_run);
        }
        _ => {
            print_usage();
            std::process::exit(1);
        }
    }
}

fn print_usage() {
    eprintln!(
        "usage: crashlab run start [options]\n\
                crashlab run cancel <id>\n\
                crashlab runs list\n\
                crashlab runs status <id> [--json]\n\
                crashlab replay seed <bundle-json-path>\n\
                crashlab regression-suite <suite-json-path-or-directory>\n\
                crashlab retention sweep [--dry-run] [--heartbeat-ttl <secs>] [--grace-period <secs>]\n\
                \n\
                run start options:\n\
                \x20 --preset <smoke|nightly|deep>   campaign profile (default: $CRASHLAB_PRESET or nightly)\n\
                \x20 --budget <n>                   mutation budget cap (default: preset budget)\n\
                \x20 --seeds <n>                    seeds to schedule (default: --budget)\n\
                \x20 --workers <n>                  total workers in the campaign (default: 1)\n\
                \x20 --worker <i>                   this worker's index (default: 0)\n\
                \x20 --output <dir>                 state/output root (default: $CRASHLAB_STATE_DIR or .crashlab)\n\
                \x20 --checkpoint-interval <n>      seeds between checkpoints (default: 1000)\n\
                \x20 --progress-interval <n>        seeds between progress lines (default: 100)\n\
                \x20 --run-id <n>                   run id, used by `run cancel` (default: 1)\n\
                \x20 --resume                       resume from an existing checkpoint\n\
                \x20 --help                         print this message"
    );
}

fn list_runs() {
    let base = default_state_dir();
    let runs_dir = base.join("runs");

    let entries = match std::fs::read_dir(&runs_dir) {
        Ok(e) => e,
        Err(_) => {
            println!("no runs found");
            return;
        }
    };

    let mut ids: Vec<u64> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| e.file_name().to_string_lossy().parse::<u64>().ok())
        .collect();

    if ids.is_empty() {
        println!("no runs found");
        return;
    }

    ids.sort_unstable();
    for id in ids {
        let run_id = RunId(id);
        let status = if cancel_requested(run_id, &base) {
            "cancelled"
        } else {
            "active"
        };
        println!("{id}\t{status}");
    }
}

/// Prints the latest health snapshot a campaign wrote for `id`.
fn report_run_status(id: u64, as_json: bool) {
    let base = default_state_dir();
    let run_id = RunId(id);

    match read_latest_health_snapshot(run_id, &base) {
        Ok(Some(snapshot)) => {
            if as_json {
                // The raw line, so the web SSE route reads exactly what the
                // campaign wrote.
                match snapshot.to_json_line() {
                    Ok(line) => print!("{line}"),
                    Err(e) => {
                        eprintln!("failed to serialize health snapshot for run {id}: {e}");
                        std::process::exit(1);
                    }
                }
            } else {
                print_snapshot_summary(&snapshot);
            }
        }
        // A run without snapshots has not started, or ran before snapshots
        // existed. That is a normal state, not a failure.
        Ok(None) => {
            if as_json {
                println!("null");
            } else {
                println!("no health snapshot for run {id}");
            }
        }
        Err(e) => {
            eprintln!("failed to read health snapshot for run {id}: {e}");
            std::process::exit(1);
        }
    }
}

fn print_snapshot_summary(snapshot: &HealthSnapshot) {
    println!(
        "run {}: {}",
        snapshot.run_id,
        health_status_label(&snapshot.status)
    );

    if let Some(campaign_id) = &snapshot.campaign_id {
        println!("  campaign: {campaign_id}");
    }
    if let Some(terminal) = &snapshot.terminal {
        println!("  terminal: {terminal}");
    }
    println!(
        "  snapshot: #{} emitted {}",
        snapshot.sequence, snapshot.emitted_at
    );
    println!(
        "  seeds: {}/{} processed, {} remaining",
        snapshot.budget.processed_seeds,
        snapshot.budget.total_seeds,
        snapshot.budget.remaining_seeds
    );
    println!(
        "  throughput: {:.2} seeds/sec over {:.2}s",
        snapshot.throughput.cases_per_second, snapshot.throughput.elapsed_secs
    );
    println!(
        "  failures: {} total, {} distinct class(es), rate {:.4}",
        snapshot.failures.total_failures,
        snapshot.failures.unique_signatures,
        snapshot.failures.failure_rate
    );

    if snapshot.failure_classes.is_empty() {
        println!("    (no classified failures)");
    } else {
        for (class, count) in &snapshot.failure_classes {
            println!("    {class}: {count}");
        }
    }

    println!(
        "  queue: {} pending, {} in progress, capacity {} ({:.1}%)",
        snapshot.queue.pending,
        snapshot.queue.in_progress,
        snapshot.queue.capacity,
        snapshot.queue.utilization * 100.0
    );
}

fn health_status_label(status: &HealthStatus) -> &'static str {
    match status {
        HealthStatus::Healthy => "healthy",
        HealthStatus::Degraded => "degraded",
        HealthStatus::Unhealthy => "unhealthy",
    }
}

fn run_regression_suite_command(path: &str) {
    let path_obj = Path::new(path);

    // Determine if path is a file or directory
    let json_bytes = if path_obj.is_file() {
        // Single file - load it directly
        match fs::read(path_obj) {
            Ok(bytes) => bytes,
            Err(e) => {
                eprintln!("failed to read file {}: {}", path, e);
                std::process::exit(1);
            }
        }
    } else if path_obj.is_dir() {
        // Directory - load all .json files and merge into a single array
        match load_fixtures_from_directory(path_obj) {
            Ok(bytes) => bytes,
            Err(e) => {
                eprintln!("failed to load fixtures from directory {}: {}", path, e);
                std::process::exit(1);
            }
        }
    } else {
        eprintln!("path does not exist or is not accessible: {}", path);
        std::process::exit(1);
    };

    // Run the regression suite
    match run_regression_suite_from_json(&json_bytes) {
        Ok(summary) => {
            println!("::group::Regression Suite Results");
            println!("Total: {}", summary.total);
            println!("Passed: {}", summary.passed);
            println!("Failed: {}", summary.failed);
            println!("::endgroup::");

            if summary.failed > 0 {
                println!();
                println!("Failed test cases:");
                for case in &summary.cases {
                    if !case.passed {
                        if let Some(ref error) = case.error {
                            eprintln!(
                                "::error::Seed {} ({}): {}",
                                case.seed_id, case.mode, error
                            );
                        } else if let Some(ref actual) = case.actual_failure_class {
                            eprintln!(
                                "::error::Seed {} ({}): expected {}, got {}",
                                case.seed_id, case.mode, case.expected_failure_class, actual
                            );
                        } else {
                            eprintln!(
                                "::error::Seed {} ({}): test failed without details",
                                case.seed_id, case.mode
                            );
                        }
                    }
                }
                std::process::exit(1);
            } else {
                println!();
                println!("✅ All regression tests passed!");
            }
        }
        Err(e) => {
            eprintln!("failed to parse or run regression suite: {}", e);
            std::process::exit(1);
        }
    }
}

fn load_fixtures_from_directory(dir: &Path) -> Result<Vec<u8>, String> {
    let mut scenarios = Vec::new();

    let entries = fs::read_dir(dir).map_err(|e| format!("failed to read directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Only process .json files
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
            let bytes = fs::read(&path)
                .map_err(|e| format!("failed to read {}: {}", path.display(), e))?;

            // Try to parse as a single scenario
            if let Ok(scenario) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                // Check if it's an array or a single object
                if scenario.is_array() {
                    // It's already an array of scenarios
                    if let Ok(array) = serde_json::from_slice::<Vec<serde_json::Value>>(&bytes) {
                        scenarios.extend(array);
                    }
                } else {
                    // It's a single scenario
                    scenarios.push(scenario);
                }
            }
        }
    }

    if scenarios.is_empty() {
        return Err("no valid JSON fixtures found in directory".to_string());
    }

    // Serialize the combined array
    serde_json::to_vec(&scenarios).map_err(|e| format!("failed to serialize scenarios: {}", e))
}

// ── run start (campaign launch) ─────────────────────────────────────────────

/// Resolved options for `crashlab run start`.
struct RunStartOptions {
    preset: CampaignPreset,
    budget: u64,
    seeds: u64,
    workers: u32,
    worker: u32,
    output: PathBuf,
    checkpoint_interval: u64,
    progress_interval: u64,
    run_id: u64,
    resume: bool,
}

/// Longest payload generated per seed, so `deep` explores wider mutations than
/// `smoke` without needing a separate knob.
fn payload_len_for(intensity_bps: u32) -> usize {
    8 + (intensity_bps as usize / 1_000)
}

/// Builds the seed for `seed_index`.
///
/// Seeds are derived from the preset's fixed `base_seed` mixed with the global
/// index, so every worker in a partitioned campaign agrees on the schedule and a
/// replay with the same preset reproduces the same stream.
fn build_seed(base_seed: u64, seed_index: u64, payload_len: usize) -> CaseSeed {
    let mut prng = SeededPrng::new(base_seed ^ seed_index.wrapping_mul(0x9E37_79B9_7F4A_7C15));
    CaseSeed {
        id: seed_index,
        payload: prng.mutation_stream(payload_len),
    }
}

fn parse_run_start_options(args: &[String]) -> Result<RunStartOptions, String> {
    if args.iter().any(|a| a == "--help" || a == "-h") {
        print_usage();
        std::process::exit(0);
    }

    // Preset first: the budget default depends on it.
    let mut preset = CampaignPreset::from_env_or_default();
    let mut budget: Option<u64> = None;
    let mut seeds: Option<u64> = None;
    let mut workers: u32 = 1;
    let mut worker: u32 = 0;
    let mut output: Option<PathBuf> = None;
    let mut checkpoint_interval: u64 = 1_000;
    let mut progress_interval: u64 = 100;
    let mut run_id: u64 = 1;
    let mut resume = false;

    let mut i = 0usize;
    while i < args.len() {
        let arg = args[i].as_str();
        // Accept both `--flag value` and `--flag=value`.
        let (flag, inline) = match arg.split_once('=') {
            Some((f, v)) => (f, Some(v.to_string())),
            None => (arg, None),
        };

        let mut take_value = |name: &str| -> Result<String, String> {
            if let Some(v) = inline.clone() {
                return Ok(v);
            }
            i += 1;
            args.get(i)
                .cloned()
                .ok_or_else(|| format!("missing value for {name}"))
        };

        match flag {
            "--preset" => {
                let v = take_value("--preset")?;
                preset = v
                    .parse::<CampaignPreset>()
                    .map_err(|e: crashlab_core::ParseCampaignPresetError| e.to_string())?;
            }
            "--budget" => budget = Some(parse_u64(&take_value("--budget")?, "--budget")?),
            "--seeds" => seeds = Some(parse_u64(&take_value("--seeds")?, "--seeds")?),
            "--workers" => {
                workers = parse_u32(&take_value("--workers")?, "--workers")?;
            }
            "--worker" => worker = parse_u32(&take_value("--worker")?, "--worker")?,
            "--output" => output = Some(PathBuf::from(take_value("--output")?)),
            "--checkpoint-interval" => {
                checkpoint_interval =
                    parse_u64(&take_value("--checkpoint-interval")?, "--checkpoint-interval")?;
            }
            "--progress-interval" => {
                progress_interval =
                    parse_u64(&take_value("--progress-interval")?, "--progress-interval")?;
            }
            "--run-id" => run_id = parse_u64(&take_value("--run-id")?, "--run-id")?,
            "--resume" => resume = true,
            other => return Err(format!("unknown option: {other}")),
        }
        i += 1;
    }

    if checkpoint_interval == 0 {
        return Err("--checkpoint-interval must be greater than 0".to_string());
    }
    if progress_interval == 0 {
        return Err("--progress-interval must be greater than 0".to_string());
    }
    // Reuse the partition validator so the CLI and the engine agree on the rule.
    WorkerPartition::try_new(worker, workers).map_err(|e| e.to_string())?;

    let params = preset.parameters();
    let budget = budget.unwrap_or(params.max_mutations_per_run);
    let seeds = seeds.unwrap_or(budget);

    Ok(RunStartOptions {
        preset,
        budget,
        seeds,
        workers,
        worker,
        output: output.unwrap_or_else(default_state_dir),
        checkpoint_interval,
        progress_interval,
        run_id,
        resume,
    })
}

fn parse_u64(raw: &str, flag: &str) -> Result<u64, String> {
    raw.trim()
        .parse::<u64>()
        .map_err(|_| format!("invalid value for {flag}: {raw}"))
}

fn parse_u32(raw: &str, flag: &str) -> Result<u32, String> {
    raw.trim()
        .parse::<u32>()
        .map_err(|_| format!("invalid value for {flag}: {raw}"))
}

/// Builds a checkpoint snapshot for `next_seed_index` without borrowing the
/// driver's checkpoint.
///
/// `ring_coverage` starts empty, which is the documented representation of "no
/// ring partitioning has been swept yet" and is exactly how a v1 checkpoint is
/// interpreted on load.
fn snapshot_checkpoint(campaign_id: &str, next_seed_index: u64, total_seeds: usize) -> RunCheckpoint {
    RunCheckpoint {
        schema: RUN_CHECKPOINT_SCHEMA_VERSION,
        campaign_id: campaign_id.to_string(),
        next_seed_index: next_seed_index as usize,
        total_seeds,
        ring_coverage: RingCoverage::new(),
    }
}

/// Writes `checkpoint` so a reader never observes a partial file (ADR-0008).
fn write_checkpoint_atomic(path: &Path, checkpoint: &RunCheckpoint) -> Result<(), String> {
    let bytes = save_run_checkpoint_json(checkpoint).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

fn run_start_command(args: &[String]) {
    let opts = match parse_run_start_options(args) {
        Ok(o) => o,
        Err(msg) => {
            eprintln!("crashlab run start: {msg}");
            print_usage();
            std::process::exit(1);
        }
    };

    let total_seeds = match usize::try_from(opts.seeds) {
        Ok(v) => v,
        Err(_) => {
            eprintln!(
                "--seeds {} exceeds the supported range on this platform",
                opts.seeds
            );
            std::process::exit(1);
        }
    };

    let run_id = RunId(opts.run_id);
    let run_dir = opts.output.join("runs").join(opts.run_id.to_string());
    let checkpoint_path = run_dir.join("checkpoint.json");

    // Cancel markers live under the state dir, so point the signal at the same
    // root the cancel command writes to.
    let state_dir = opts.output.clone();
    let signal = CancelSignal::with_state_dir(run_id, &state_dir);

    // Stable across workers and resumes so a mismatched resume is detected.
    let campaign_id = format!("{}-w{}", opts.preset.as_str(), opts.worker);

    let mut runner = match create_runner() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("failed to create runner: {e}");
            std::process::exit(1);
        }
    };

    let partition = if opts.workers > 1 {
        match WorkerPartition::try_new(opts.worker, opts.workers) {
            Ok(p) => Some(p),
            Err(e) => {
                eprintln!("invalid worker partition: {e}");
                std::process::exit(1);
            }
        }
    } else {
        None
    };

    let mut checkpoint = if opts.resume {
        let bytes = match fs::read(&checkpoint_path) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("failed to read checkpoint {}: {e}", checkpoint_path.display());
                std::process::exit(1);
            }
        };
        match load_run_checkpoint_json(&bytes) {
            Ok(cp) => cp,
            Err(e) => {
                eprintln!(
                    "failed to parse checkpoint {}: {e}",
                    checkpoint_path.display()
                );
                std::process::exit(1);
            }
        }
    } else {
        snapshot_checkpoint(&campaign_id, 0, total_seeds)
    };

    let params = opts.preset.parameters();
    let base_seed = params.base_seed;
    let payload_len = payload_len_for(params.mutation_intensity_bps);

    let mut budget = MutationBudget::new(opts.budget);
    let mut health = HealthMonitor::new(opts.budget.max(1));
    let mut seen_signatures: HashSet<u64> = HashSet::new();
    let mut runner_errors: u64 = 0;
    let mut since_checkpoint: u64 = 0;
    let mut since_progress: u64 = 0;
    // Next global seed index this worker should inspect. Tracked separately from
    // the checkpoint handed to the resume driver so the work closure and the
    // driver never need a second mutable borrow of the same value.
    let mut next_seed_index: u64 = if opts.resume {
        checkpoint.next_seed_index as u64
    } else {
        0
    };
    let started = Instant::now();

    println!(
        "starting campaign {campaign_id}: preset={} seeds={} budget={} workers={} worker={} run_id={}",
        opts.preset.as_str(),
        opts.seeds,
        opts.budget,
        opts.workers,
        opts.worker,
        opts.run_id
    );
    println!("state dir: {}", opts.output.display());
    println!("checkpoint: {}", checkpoint_path.display());
    if cancel_requested(run_id, &state_dir) {
        println!("note: a cancel marker already exists for run {}", opts.run_id);
    }

    // `drive_run_from_checkpoint` advances its own checkpoint, so the closure
    // only records progress into `next_seed_index` and snapshots it.
    let mut work = |seed_index: u64| -> Result<(), String> {
        if !budget.try_attempt() {
            // Budget exhausted: stop scheduling mutations but let the driver
            // finish its loop so cancellation and reporting stay uniform.
            return Ok(());
        }

        let seed = build_seed(base_seed, seed_index, payload_len);
        health.record_case();

        match runner.run_seed(&seed) {
            Ok(signature) => {
                let is_new = seen_signatures.insert(signature.signature_hash);
                health.record_failure(is_new);
            }
            Err(err) => {
                // One bad seed must not abandon a long campaign: count it and
                // keep going. Genuine internal faults are surfaced by returning
                // Err from here instead.
                runner_errors += 1;
                health.record_failure(false);
                eprintln!("seed {seed_index}: runner error: {err}");
            }
        }

        next_seed_index = seed_index + 1;
        since_checkpoint += 1;
        since_progress += 1;

        if since_progress >= opts.progress_interval {
            since_progress = 0;
            let s = health.summary();
            println!(
                "progress: seeds/sec={:.2} cases={} failures={} unique={} budget_remaining={} elapsed={:.1}s",
                s.throughput.cases_per_second,
                s.throughput.total_cases,
                s.failures.total_failures,
                s.failures.unique_signatures,
                budget.remaining(),
                s.throughput.elapsed_secs
            );
        }

        if since_checkpoint >= opts.checkpoint_interval {
            since_checkpoint = 0;
            write_checkpoint_atomic(
                &checkpoint_path,
                &snapshot_checkpoint(&campaign_id, next_seed_index, total_seeds),
            )?;
        }

        Ok(())
    };

    let terminal = if opts.resume {
        let driver_cp = &mut checkpoint;
        let result = match &partition {
            Some(p) => drive_run_partitioned_from_checkpoint(
                run_id,
                &campaign_id,
                driver_cp,
                opts.seeds,
                p,
                &signal,
                &mut work,
            ),
            None => drive_run_from_checkpoint(
                run_id,
                &campaign_id,
                driver_cp,
                opts.seeds,
                &signal,
                &mut work,
            ),
        };
        match result {
            Ok(state) => state,
            Err(e) => {
                eprintln!("failed to resume run: {e}");
                std::process::exit(1);
            }
        }
    } else {
        drive_run(run_id, opts.seeds, &signal, partition, &mut work)
    };

    // Always flush a final checkpoint so a completed or cancelled campaign can
    // be inspected and safely re-resumed.
    if let Err(e) = write_checkpoint_atomic(
        &checkpoint_path,
        &snapshot_checkpoint(&campaign_id, next_seed_index, total_seeds),
    ) {
        eprintln!("warning: failed to write final checkpoint: {e}");
    }

    let summary = health.summary();
    println!("budget: {}", budget.report().to_cli_line());
    if runner_errors > 0 {
        println!("runner errors: {runner_errors}");
    }
    println!(
        "health: cases={} failures={} unique_signatures={} failure_rate={:.4} cases_per_second={:.2}",
        summary.throughput.total_cases,
        summary.failures.total_failures,
        summary.failures.unique_signatures,
        summary.failures.failure_rate,
        summary.throughput.cases_per_second
    );

    match &terminal {
        RunTerminalState::Completed { summary } => {
            println!(
                "run {} completed: seeds_processed={} elapsed={:.1}s",
                opts.run_id,
                summary.seeds_processed,
                started.elapsed().as_secs_f64()
            );
        }
        RunTerminalState::Cancelled { summary } => {
            println!(
                "run {} cancelled at seed {:?}: seeds_processed={}",
                opts.run_id, summary.cancelled_at_seed, summary.seeds_processed
            );
        }
        RunTerminalState::Failed { message } => {
            eprintln!("run {} failed: {message}", opts.run_id);
            std::process::exit(1);
        }
    }
}

fn sweep_retention(policy: &RetentionPolicy, dry_run: bool) {
    let base = default_state_dir();
    let now = chrono::Utc::now();

    // 1. Sweep failure bundles (artifacts)
    let store_path = base.join("artifacts");
    let store = match LocalArtifactStore::new(&store_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("failed to open artifact store at {}: {}", store_path.display(), e);
            std::process::exit(1);
        }
    };

    let artifacts = match store.list_artifacts() {
        Ok(list) => list,
        Err(e) => {
            eprintln!("failed to list artifacts: {}", e);
            std::process::exit(1);
        }
    };

    let mut bundle_records = Vec::new();
    let mut artifact_ids = Vec::new();

    for art in &artifacts {
        let path = store_path.join(format!("{}.json", art.id));
        let bytes = match fs::read(&path) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("warning: failed to read artifact file {}: {}", path.display(), e);
                continue;
            }
        };
        let doc: CaseBundleDocument = match serde_json::from_slice(&bytes) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("warning: failed to parse artifact JSON {}: {}", path.display(), e);
                continue;
            }
        };
        let created_at = match chrono::DateTime::parse_from_rfc3339(&art.created_at) {
            Ok(dt) => dt.with_timezone(&chrono::Utc),
            Err(_) => chrono::Utc::now(),
        };

        bundle_records.push(RetentionRecord::new(doc, created_at));
        artifact_ids.push(art.id.clone());
    }

    let bundles_keep = policy.retain_failure_bundle_records(&bundle_records, now);
    let mut deleted_bundles = 0;
    for (i, &keep) in bundles_keep.iter().enumerate() {
        if !keep {
            let id = &artifact_ids[i];
            if dry_run {
                println!("[retention] (dry-run) would prune failure bundle: {id}");
                continue;
            }
            match store.delete_artifact(id) {
                Ok(()) => {
                    println!("pruned old failure bundle: {id}");
                    deleted_bundles += 1;
                }
                Err(e) => {
                    eprintln!("failed to delete artifact {id}: {e}");
                }
            }
        }
    }

    // 2. Sweep checkpoints
    let runs_dir = base.join("runs");
    let mut checkpoint_records = Vec::new();
    let mut run_dirs = Vec::new();

    if let Ok(entries) = fs::read_dir(&runs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let checkpoint_path = path.join("checkpoint.json");
                if checkpoint_path.is_file() {
                    let bytes = match fs::read(&checkpoint_path) {
                        Ok(b) => b,
                        Err(e) => {
                            eprintln!("warning: failed to read checkpoint at {}: {}", checkpoint_path.display(), e);
                            continue;
                        }
                    };
                    let cp: RunCheckpoint = match serde_json::from_slice(&bytes) {
                        Ok(c) => c,
                        Err(e) => {
                            eprintln!("warning: failed to parse checkpoint at {}: {}", checkpoint_path.display(), e);
                            continue;
                        }
                    };
                    let metadata = match fs::metadata(&checkpoint_path) {
                        Ok(m) => m,
                        Err(e) => {
                            eprintln!("warning: failed to read metadata for checkpoint at {}: {}", checkpoint_path.display(), e);
                            continue;
                        }
                    };
                    let modified = metadata.modified().unwrap_or_else(|_| std::time::SystemTime::now());
                    let duration = modified.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                    let created_at = chrono::DateTime::<chrono::Utc>::from(std::time::UNIX_EPOCH + duration);

                    checkpoint_records.push(RetentionRecord::new(cp, created_at));
                    run_dirs.push(path);
                }
            }
        }
    }

    let checkpoints_keep = policy.retain_checkpoint_records(&checkpoint_records, now);
    let mut deleted_checkpoints = 0;
    for (i, &keep) in checkpoints_keep.iter().enumerate() {
        if !keep {
            let dir = &run_dirs[i];
            let checkpoint_created_at = checkpoint_records[i].created_at;

            // Live Heartbeat check: refuse deletion if heartbeat is fresh within TTL
            let heartbeat_ttl = policy.heartbeat_ttl.unwrap_or_else(|| chrono::Duration::seconds(60));
            let heartbeat = crashlab_core::stale_detector::read_heartbeat(dir);
            let has_live_heartbeat =
                crashlab_core::stale_detector::is_heartbeat_alive(dir, heartbeat_ttl, now);

            let heartbeat_desc = match &heartbeat {
                Some(hb) => {
                    let age = now.signed_duration_since(hb.timestamp).num_seconds();
                    format!("timestamp={}, age={}s", hb.timestamp.to_rfc3339(), age)
                }
                None => "none".to_string(),
            };

            println!(
                "[retention] evaluating candidate run directory {}: checkpoint_mtime={}, heartbeat={}",
                dir.display(),
                checkpoint_created_at.to_rfc3339(),
                heartbeat_desc
            );

            if has_live_heartbeat {
                println!(
                    "[retention] skipping active run directory {}: live heartbeat detected ({})",
                    dir.display(),
                    heartbeat_desc
                );
                continue;
            }

            // Advisory Lock check: refuse deletion if active worker holds lock
            let _lock = match crashlab_core::stale_detector::RunDirLock::try_acquire(dir) {
                Ok(Some(l)) => l,
                Ok(None) => {
                    println!(
                        "[retention] skipping locked run directory {}: advisory lock held by active worker",
                        dir.display()
                    );
                    continue;
                }
                Err(e) => {
                    eprintln!("warning: failed to acquire advisory lock for {}: {}", dir.display(), e);
                    continue;
                }
            };

            // Two-phase sweep: mark -> grace period -> delete
            let mark_path = dir.join(crashlab_core::stale_detector::SWEEP_MARK_FILE_NAME);
            if policy.sweep_grace_period > chrono::Duration::zero() {
                if !mark_path.exists() {
                    let mark_content = format!(
                        "marked_at={}\ncheckpoint_mtime={}\nheartbeat={}\n",
                        now.to_rfc3339(),
                        checkpoint_created_at.to_rfc3339(),
                        heartbeat_desc
                    );
                    if let Err(e) = fs::write(&mark_path, mark_content) {
                        eprintln!("warning: failed to write sweep mark file at {}: {}", mark_path.display(), e);
                    } else {
                        println!(
                            "[retention] marked candidate run directory for deletion: {} (grace period: {}s)",
                            dir.display(),
                            policy.sweep_grace_period.num_seconds()
                        );
                    }
                    continue;
                } else if let Ok(meta) = fs::metadata(&mark_path) {
                    if let Ok(mtime) = meta.modified() {
                        let dur = mtime.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                        let marked_at = chrono::DateTime::<chrono::Utc>::from(std::time::UNIX_EPOCH + dur);
                        let elapsed = now.signed_duration_since(marked_at);
                        if elapsed < policy.sweep_grace_period {
                            println!(
                                "[retention] candidate run directory {} is still within grace period ({}s / {}s)",
                                dir.display(),
                                elapsed.num_seconds(),
                                policy.sweep_grace_period.num_seconds()
                            );
                            continue;
                        }
                    }
                }
            }

            if dry_run {
                println!("[retention] (dry-run) would prune run directory: {}", dir.display());
                continue;
            }

            match fs::remove_dir_all(dir) {
                Ok(()) => {
                    println!("pruned old run checkpoint directory: {}", dir.display());
                    deleted_checkpoints += 1;
                }
                Err(e) => {
                    eprintln!("failed to remove run directory {}: {}", dir.display(), e);
                }
            }
        }
    }

    println!("sweep summary: pruned {deleted_bundles} bundle(s), {deleted_checkpoints} checkpoint(s).");
}
