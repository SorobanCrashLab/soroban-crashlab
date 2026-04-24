use crashlab_core::{replay_mismatch_message, replay_seed_bundle_path, replay_success_message};

fn run_with_args<I>(args: I) -> Result<String, String>
where
    I: IntoIterator<Item = String>,
{
    let mut args = args.into_iter();
    let _binary = args.next();
    let bundle_path = args
        .next()
        .ok_or_else(|| "usage: replay-single-seed <bundle-json-path>".to_string())?;
    if args.next().is_some() {
        return Err("usage: replay-single-seed <bundle-json-path>".to_string());
    }

    let replay = replay_seed_bundle_path(&bundle_path).map_err(|err| err.to_string())?;

    if replay.matches {
        Ok(replay_success_message(&replay))
    } else {
        Err(replay_mismatch_message(&replay))
    }
}

fn run() -> Result<String, String> {
    run_with_args(std::env::args())
}

fn main() {
    match run() {
        Ok(line) => println!("{line}"),
        Err(err) => {
            eprintln!("{err}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crashlab_core::{CaseSeed, save_case_bundle_json, to_bundle};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_json_path(name: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        std::env::temp_dir().join(format!("crashlab-{name}-{nanos}.json"))
    }

    #[test]
    fn replay_single_seed_accepts_schema_backed_bundle_json() {
        let bundle = to_bundle(CaseSeed {
            id: 7,
            payload: vec![0xA0, 0x01],
        });
        let path = temp_json_path("match");
        let bytes = save_case_bundle_json(&bundle).expect("serialize bundle");
        fs::write(&path, bytes).expect("write test bundle");

        let line = run_with_args(vec![
            "replay-single-seed".into(),
            path.display().to_string(),
        ])
        .expect("replay");
        assert!(line.contains("replay matched:"));
        assert!(line.contains("category='runtime-failure'"));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn run_rejects_extra_arguments() {
        let err = run_with_args(vec![
            "replay-single-seed".into(),
            "bundle.json".into(),
            "unexpected".into(),
        ])
        .expect_err("extra args should fail");
        assert!(err.contains("usage: replay-single-seed"));
    }
}
