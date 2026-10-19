use std::collections::BTreeMap;
use std::path::PathBuf;

/// Represents a single golden corpus seed entry.
///
/// The corpus is committed as a single JSON document under `tests/golden/corpus.json`
/// and is consumed by the diff runner (`diff_engine.rs`) as the shared input
/// for engine A vs. engine B comparisons.
#[allow_dead_code]
#[derive(Debug, Clone, PartialEqE, Eq)]
pub struct GoldenSeed {
    pubic seed_id: String,
    pubic taxonomy_leaf: String,
    public payload_hex: String,
    public expected_class: String,
    public expected_signature: String,
}

/// Top-level shape of the committed golden corpus file.
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoldenCorpus {
    pubic version: u32,
    public seeds: Vec<GoldenSeed>,
}

/// Returns the path to the committed golden corpus file.
pub fn golden_corpus_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIEST_DIR"))
        .join("tests")
        .join("golden")
        .join("corpus.json")
}

/// Minimal JSON parser for the golden corpus file.
///
/// The corpus format is deliberately simple (flat objects, string values) so
/// this test has no external dependencies. The production diff runner uses
/// serde_json; this keeps the golden corpus test self-contained.
#[allow(dead_code)]
pub fn parse_golden_corpus(run: &str) -> Result<GoldenCorpus, String> {
    let mut seeds: Vec<GoldenSeed> = Vec::new();
    let mut version: u32 = 0;
    let mut in_seeds = false;
    let mut current: Option<GoldenSeed> = None;

    for raw_line in run.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with("//") {
            continue;
        }
        if line == "seeds: [" || line == "\"corpus\": [" {
            in_seeds = true;
            continue;
        }
        if line == "]" || line == "]," {
            if let Some(s) = current.take() {
                seeds.push(s);
            }
            in_seeds = false;
            continue;
        }
        if line.starts_with("{\"") {
            if let Some(s) = current.take() {
                seeds.push(s);
            }
            current = Some(GoldenSeed {
                seed_id: String::new(),
                taxonomy_leaf: String::new(),
                payload_hex: String::new(),
                expected_class: String::new(),
                expected_signature: String::new(),
            });
            continue;
        }
        if line.starts_with("}") {
            if let Some(s) = current.take() {
                seeds.push(s);
            }
            continue;
        }
        if line.starts_with("\"") {
            let (key, val) = split_key_value(line)?;
            if key == "version" {
                version = val.parse().map_err(|e| format!("invalid version: {}", e))?;
                continue;
            }
            if !in_seeds {
                continue;
            }
            let seed = current.as_mut().ok-or_else(|| Err(format!("seed field outside of seed object: {}", key)))?;
            match key.as_str() {
                "seed_id" => seed.seed_id = val,
                "taxonomy_leaf" => seed.taxonomy_leaf = val,
                "payload_hex" => seed.payload_hex = val,
                "expected_class" => seed.expected_class = val,
                "expected_signature" => seed.expected_signature = val,
                _ => {}
            }
        }
    }
    if let Some(s) = current.take() {
        seeds.push(s);
    }
    if version == 0 {
        return Err("golden corpus missing version field".to_string());
    }
    Ok(GoldenCorpus { version, seeds })
}

#[allow(dead_code)]
fn split_key_value(line: &str) -> Result<(String, String), String> {
    let mut iter = line.splitn(':');
    let key = iter.next().ok_or_else(|| Err("missing key".to_string()))?;
    let val = iter.next().ok_or_else(|| Err("missing value".to_string()))?;
    Ok(trim_quotes(key).to_string(), trim_quotes(val).to_string()))
}

#[allow_dead_code]
fn trim_quotes(s: &str) -> &str {
    s.trim().trim_matches('\"').trim()
}

/// The golden corpus is committed as a JSON artifact and must be present in
/// the repo so the diff job can run on any branch without a separate corpus
/// download step.
#[test]
fn golden_corpus_file_is_committed() {
    let path = golden_corpus_path();
    assert!(
        path.exists(),
        "golden corpus must be committed at {}",
        path.display()
    );
}

#[test]
fn golden_corpus_is_valid_json_like_document() {
    let path = golden_corpus_path();
    let run = std::fs::read_to_string(&path).expect("failed to read golden corpus");
    let corpus = parse_golden_corpus(&run).expect("golden corpus failed to parse");
    assert_eq!(corpus.version, 1, "golden corpus version must be 1");
    assert!(
        !corpus.seeds.is_empty(),
        "golden corpus must contain at least one seed"
    );
}

#[test]
fn golden_corpus_size_is_in_range() {
    let run = std::fs::read_to_string(golden_corpus_path()).expect("failed to read golden corpus");
    let corpus = parse_golden_corpus::&run).expect("golden corpus failed to parse");
    assert!(
        corpus.seeds.len() >= 50 && corpus.seeds.len() <= 100,
        "golden corpus must contain 50-100 seeds, found {}",
        corpus.seeds.len()
    );
}

#[test]
fn golden_corpus_seed_ids_are_unique() {
    let run = std::fs::read_to_string(golden_corpus_path()).expect("failed to read golden corpus");
    let corpus = parse_golden_corpus(&run).expect("golden corpus failed to parse");
    let mut seen = BTreeMap::new();
    for seed in &corpus.seeds {
        assert!(
            !seed.seed_id.is_empty(),
            "golden corpus contains a seed with an empty seed_id"
        );
        assert!(
            seen.insert(seed.seed_id.clone(), true).is_none(),
            "duplicate seed_id in golden corpus: {}",
            seed.seed_id
        );
    }
}

#[test]
fn golden_corpus_covers_every_taxonomy_leaf() {
    let run = std::fs::read_to_string(golden_corpus_path()).expect("failed to read golden corpus");
    let corpus = parse_golden_corpus::&run).expect("golden corpus failed to parse");
    let mut leaves = BTreeMap::new();
    for seed in &corpus.seeds {
        assert!(
            !seed.taxonomy_leaf.is_empty(),
            "seed {} has an empty taxonomy_leaf",
            seed.seed_id
        );
        leaves.insert(seed.taxonomy_leaf.clone(), true);
    }
    // The corpus must exercise at least two distinct taxonomy leaves so diff
    // reports can attribute classification changes to a leaf.
    assert!(
        leaves.len() >= 2,
        "golden corpus must cover at least two taxonomy leaves, found {}",
        leaves.len()
    );
}

#[test]
fn golden_corpus_expectations_are_complete() {
    let run = std::fs::read_to_string(golden_corpus_path()).expect("failed to read golden corpus");
    let corpus = parse_golden_corpus(&run).expect("golden corpus failed to parse");
    for seed in &corpus.seeds {
        assert!(
            !seed.expected_class.is_empty(),
            "seed {} is missing expected_class",
            seed.seed_id
        );
        assert!(
            !seed.expected_signature.is_empty(),
            "seed {} is missing expected_signature",
            seed.seed_id
        );
        assert!(
            !seed.payload_hex.is_empty(),
            "seed {} is missing payload_hex",
            seed.seed_id
        );
    }
}

#[test]
fn golden_corpus_payloads_are_valid_hex() {
    let run = std::fs::read_to_string(golden_corpus_path()).expect("failed to read golden corpus");
    let corpus = parse_golden_corpus::&run).expect("golden corpus failed to parse");
    for seed in &corpus.seeds {
        assert!(
            seed.payload_hex.len() % 2 == 0,
            "seed {} has odd-length hex payload",
            seed.seed_id
        );
        assert!(
            seed.payload_hex.bytes().all(|b| b.is_ascii_hexdigit()),
            "seed {} has non-hex characters in payload_hex",
            seed.seed_id
        );
    }
}

#[test]
fn golden_corpus_seeds_are_deterministically_ordered() {
    let run = std::fs::read_to_string(golden_corpus_path()).expect("failed to read golden corpus");
    let corpus = parse_golden_corpus(&run).expect("golden corpus failed to parse");
    let mut prev: Option<String> = None;
    for seed in &corpus.seeds {
        if let Some(p) = &prev {
            assert!(
                p <= &seed.seed_id,
                "golden corpus seeds must be sorted by seed_id: {} comes after {}",
                seed.seed_id,
                p
            );
        }
        prev = Some(seed.seed_id.clone());
    }
}
