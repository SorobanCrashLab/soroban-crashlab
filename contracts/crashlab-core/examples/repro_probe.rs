//! Cross-platform reproducibility probe (#1898).
//!
//! Exercises the deterministic core end to end for a fixed seed set — seed
//! generation (`SeededPrng`, same derivation as `crashlab run start`), havoc
//! mutation, failure classification, signature hashing, and a bundle
//! save → load → re-classify round trip — and folds every (seed, class,
//! signature) into one digest. Equal digests on two machines are evidence the
//! deterministic contract holds there; the expected value is recorded in
//! `docs/reproducibility-contract.md`.
//!
//! ```text
//! cargo run --release --example repro_probe -- [seeds] [preset]
//! ```
//! Prints one JSON object; exits 1 if any bundle fails to round-trip.

use crashlab_core::{
    apply_havoc_mutation, crash_signature_from_seed, derive_seed_state, load_case_bundle_json,
    save_case_bundle_json, to_bundle, CampaignPreset, CaseSeed, HavocConfig, SeededPrng,
    CASE_BUNDLE_SCHEMA_VERSION,
};

/// FNV-1a, 64-bit: tiny, dependency-free, and identical on every platform.
fn fnv1a(hash: &mut u64, bytes: &[u8]) {
    for &b in bytes {
        *hash ^= b as u64;
        *hash = hash.wrapping_mul(0x100000001b3);
    }
}

fn main() {
    let mut args = std::env::args().skip(1);
    let seeds: u64 = args
        .next()
        .map(|s| s.parse().expect("seeds must be a number"))
        .unwrap_or(2_000);
    let preset: CampaignPreset = args
        .next()
        .map(|p| p.parse().expect("preset must be smoke|nightly|deep"))
        .unwrap_or(CampaignPreset::Nightly);

    let params = preset.parameters();
    let payload_len = 8 + (params.mutation_intensity_bps as usize / 1_000);
    let havoc = HavocConfig::default();

    let mut digest: u64 = 0xcbf2_9ce4_8422_2325;
    let mut roundtrip_failures = 0u64;
    let mut classes = std::collections::BTreeMap::<String, u64>::new();

    for index in 0..seeds {
        // Same derivation as `build_seed` in src/bin/crashlab.rs.
        let mut prng =
            SeededPrng::new(params.base_seed ^ index.wrapping_mul(0x9E37_79B9_7F4A_7C15));
        let mut seed = CaseSeed {
            id: index,
            payload: prng.mutation_stream(payload_len),
        };

        let mut state = derive_seed_state(&seed);
        apply_havoc_mutation(&mut seed.payload, &havoc, &mut state);

        let signature = crash_signature_from_seed(&seed);
        // `to_bundle` applies the engine's own seed mutation before
        // classifying, so the bundle carries a second signature to check.
        let bundle = to_bundle(seed.clone());
        let reloaded = save_case_bundle_json(&bundle)
            .ok()
            .and_then(|bytes| load_case_bundle_json(&bytes).ok());
        match reloaded {
            Some(loaded)
                if loaded.signature == bundle.signature
                    && crash_signature_from_seed(&loaded.seed) == bundle.signature => {}
            _ => roundtrip_failures += 1,
        }

        *classes.entry(signature.category.clone()).or_default() += 1;
        fnv1a(&mut digest, &index.to_le_bytes());
        fnv1a(&mut digest, &seed.payload);
        fnv1a(&mut digest, signature.category.as_bytes());
        fnv1a(&mut digest, &signature.signature_hash.to_le_bytes());
        fnv1a(&mut digest, &bundle.seed.payload);
        fnv1a(&mut digest, &bundle.signature.signature_hash.to_le_bytes());
    }

    let classes_json = classes
        .iter()
        .map(|(class, count)| format!("\"{class}\":{count}"))
        .collect::<Vec<_>>()
        .join(",");
    println!(
        "{{\"probe\":\"repro_probe/v1\",\"engine\":\"{}\",\"bundleSchema\":{},\"preset\":\"{}\",\"seeds\":{},\"digest\":\"{:016x}\",\"roundtripFailures\":{},\"classes\":{{{}}},\"os\":\"{}\",\"arch\":\"{}\"}}",
        env!("CARGO_PKG_VERSION"),
        CASE_BUNDLE_SCHEMA_VERSION,
        preset.as_str(),
        seeds,
        digest,
        roundtrip_failures,
        classes_json,
        std::env::consts::OS,
        std::env::consts::ARCH,
    );
    if roundtrip_failures > 0 {
        std::process::exit(1);
    }
}
