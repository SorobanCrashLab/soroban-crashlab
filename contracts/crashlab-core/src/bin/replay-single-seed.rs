use crashlab_core::{
    CaseBundle, CaseSeed, CrashSignature, EnvironmentFingerprint, RpcEnvelopeCapture,
    replay_seed_bundle,
};
use serde::Deserialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize)]
struct JsonSeed {
    id: u64,
    payload: Vec<u8>,
}

#[derive(Debug, Deserialize)]
struct JsonSignature {
    category: String,
    digest: u64,
    signature_hash: u64,
}

#[derive(Debug, Deserialize)]
struct JsonEnvironment {
    os: String,
    arch: String,
    family: String,
    tool_version: String,
}

#[derive(Debug, Deserialize)]
struct JsonBundle {
    seed: JsonSeed,
    signature: JsonSignature,
    environment: Option<JsonEnvironment>,
    failure_payload: Option<Vec<u8>>,
    rpc_envelope: Option<RpcEnvelopeCapture>,
}

fn parse_bundle(path: &Path) -> Result<CaseBundle, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("failed to read bundle '{}': {e}", path.display()))?;
    let parsed: JsonBundle = serde_json::from_str(&raw)
        .map_err(|e| format!("invalid bundle JSON '{}': {e}", path.display()))?;

    let expected_category = parsed.signature.category;
    let category = match expected_category.as_str() {
        "empty-input" => "empty-input",
        "oversized-input" => "oversized-input",
        "runtime-failure" => "runtime-failure",
        "invalid-enum-tag" => "invalid-enum-tag",
        other => return Err(format!("unsupported signature category '{other}'")),
    };

    Ok(CaseBundle {
        seed: CaseSeed {
            id: parsed.seed.id,
            payload: parsed.seed.payload,
        },
        signature: CrashSignature {
            category: category.to_string(),
            digest: parsed.signature.digest,
            signature_hash: parsed.signature.signature_hash,
        },
        environment: parsed.environment.map(|env| {
            EnvironmentFingerprint::new(env.os, env.arch, env.family, env.tool_version)
        }),
        failure_payload: parsed.failure_payload.unwrap_or_default(),
        rpc_envelope: parsed.rpc_envelope,
    })
}

fn run() -> Result<(), String> {
    let mut args = std::env::args();
    let _binary = args.next();
    let bundle_path = args
        .next()
        .ok_or_else(|| "usage: replay-single-seed <bundle-json-path>".to_string())?;
    if args.next().is_some() {
        return Err("usage: replay-single-seed <bundle-json-path>".to_string());
    }

    let bundle = parse_bundle(Path::new(&bundle_path))?;
    let replay = replay_seed_bundle(&bundle);

    if replay.matches {
        println!(
            "replay matched: class='{}' digest={} signature_hash={}",
            replay.actual.category, replay.actual.digest, replay.actual.signature_hash
        );
        return Ok(());
    }

    Err(format!(
        "replay mismatch: expected class='{}' digest={} signature_hash={}, got class='{}' digest={} signature_hash={}",
        replay.expected.category,
        replay.expected.digest,
        replay.expected.signature_hash,
        replay.actual.category,
        replay.actual.digest,
        replay.actual.signature_hash
    ))
}

fn main() {
    if let Err(err) = run() {
        eprintln!("{err}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crashlab_core::{CaseSeed, to_bundle};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_json_path(name: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        std::env::temp_dir().join(format!("crashlab-{name}-{nanos}.json"))
    }

    #[test]
    fn parse_bundle_and_replay_matches() {
        let bundle = to_bundle(CaseSeed {
            id: 7,
            payload: vec![7, 7, 7],
        });
        let payload_json = bundle
            .seed
            .payload
            .iter()
            .map(u8::to_string)
            .collect::<Vec<_>>()
            .join(",");
        let json = format!(
            "{{\"seed\":{{\"id\":{},\"payload\":[{}]}},\"signature\":{{\"category\":\"{}\",\"digest\":{},\"signature_hash\":{}}},\"environment\":null}}",
            bundle.seed.id,
            payload_json,
            bundle.signature.category,
            bundle.signature.digest,
            bundle.signature.signature_hash
        );
        let path = temp_json_path("match");
        fs::write(&path, json).expect("write test bundle");

        let parsed = parse_bundle(&path).expect("parse bundle");
        let replay = replay_seed_bundle(&parsed);
        assert!(replay.matches);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn parse_bundle_rejects_unknown_category() {
        let json = "{\"seed\":{\"id\":1,\"payload\":[1]},\"signature\":{\"category\":\"unknown\",\"digest\":1,\"signature_hash\":2},\"environment\":null}";
        let path = temp_json_path("unknown");
        fs::write(&path, json).expect("write test bundle");

        let err = parse_bundle(&path).expect_err("category should fail");
        assert!(err.contains("unsupported signature category"));

        let _ = fs::remove_file(path);
    }
}
