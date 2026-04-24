//! CrashLab CLI — campaign control helpers for operators.
//!
//! Run `crashlab run cancel <id>` to request cooperative cancellation for the
//! campaign identified by `id`, or `crashlab replay seed <bundle.json>` to
//! replay one persisted seed bundle end to end.

use crashlab_core::{
    RunId, cancel_marker_path, default_state_dir, replay_mismatch_message, replay_seed_bundle_path,
    replay_success_message, request_cancel_run,
};

fn main() {
    let mut args = std::env::args();
    let _prog = args.next();

    let a = args.next();
    let b = args.next();
    let c = args.next();
    let d = args.next();

    match (a.as_deref(), b.as_deref(), c.as_deref(), d.as_deref()) {
        (Some("run"), Some("cancel"), Some(id_str), None) => {
            if args.next().is_some() {
                eprintln!(
                    "usage: crashlab run cancel <id>\n       crashlab replay seed <bundle-json-path>"
                );
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
            if args.next().is_some() {
                eprintln!(
                    "usage: crashlab run cancel <id>\n       crashlab replay seed <bundle-json-path>"
                );
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
        _ => {
            eprintln!(
                "usage: crashlab run cancel <id>\n       crashlab replay seed <bundle-json-path>"
            );
            std::process::exit(1);
        }
    }
}
