//! Portable cross-campaign corpus exchange with verified merge.
//!
//! Corpora are normally campaign-local: sharing interesting seeds between
//! machines or teams means zipping directories by hand, which loses provenance
//! and risks treating different payloads as the same seed. This module defines a
//! **versioned, content-addressed archive format** so exchange is a first-class,
//! integrity-checked operation:
//!
//! * A [`ArchiveManifest`] records the schema version, the exporting engine
//!   version, a deterministic entry per seed (content hash, id, payload length,
//!   provenance tags), optional coverage notes, and a `manifest_hash` that acts
//!   as the archive id.
//! * Seeds are packed alongside the manifest and are addressed by
//!   [`seed_content_hash`], a SHA-256 over the seed's `(id, payload)`.
//! * [`CorpusStore::merge_archive`] verifies the archive, enforces the
//!   engine-version policy, and merges with dedup by content hash. When the same
//!   content appears under different provenance the tags are **unioned** rather
//!   than treated as a conflict.
//!
//! The engine-version policy mirrors W5-B02: archives from another engine
//! version can be rejected, skipped, or accepted.

use crate::CaseSeed;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

/// Schema version of the portable corpus archive format.
pub const CORPUS_ARCHIVE_FORMAT_VERSION: u32 = 1;

/// Archive format versions this build can load.
pub const SUPPORTED_ARCHIVE_FORMATS: &[u32] = &[CORPUS_ARCHIVE_FORMAT_VERSION];

/// Separator bytes for the canonical manifest encoding. Kept outside printable
/// ASCII so they cannot appear in ids, versions or tags.
const FIELD_SEP: u8 = 0x1e;
const PAIR_SEP: u8 = 0x1f;

/// Returns the current engine version (the crate version).
pub fn current_engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Computes the content hash of a single seed.
///
/// The hash covers the seed id, payload length and payload bytes so that two
/// seeds with byte-identical payloads but different ids remain distinct, while
/// the same seed exported from two machines hashes identically.
pub fn seed_content_hash(seed: &CaseSeed) -> String {
    let mut buf = Vec::with_capacity(16 + seed.payload.len());
    buf.extend_from_slice(&seed.id.to_le_bytes());
    buf.extend_from_slice(&(seed.payload.len() as u64).to_le_bytes());
    buf.extend_from_slice(&seed.payload);
    crate::provenance::sha256_hex(&buf)
}

/// Per-seed manifest entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchiveEntry {
    /// Content hash of the corresponding seed (see [`seed_content_hash`]).
    pub content_hash: String,
    /// Seed id.
    pub id: u64,
    /// Seed payload length in bytes.
    pub payload_len: usize,
    /// Provenance tags attached to this seed (sorted, deduplicated).
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Archive manifest: everything needed to verify and describe a packed corpus.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchiveManifest {
    /// Archive format schema version.
    pub schema: u32,
    /// Engine version that produced the archive.
    pub engine_version: String,
    /// Number of packed seeds; must equal `entries.len()`.
    pub seed_count: usize,
    /// Deterministically ordered per-seed entries.
    pub entries: Vec<ArchiveEntry>,
    /// Archive-level provenance tags (e.g. contributing teams or campaigns).
    #[serde(default)]
    pub provenance_tags: Vec<String>,
    /// Optional free-form coverage notes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coverage_notes: Option<String>,
    /// SHA-256 over the canonical encoding of all fields above; the archive id.
    /// Empty until the archive is built or loaded and verified.
    #[serde(default)]
    pub manifest_hash: String,
}

/// A seed paired with the provenance tags to record for it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaggedSeed {
    pub seed: CaseSeed,
    pub tags: Vec<String>,
}

impl TaggedSeed {
    /// Wraps a seed with no provenance tags.
    pub fn untagged(seed: CaseSeed) -> Self {
        Self {
            seed,
            tags: Vec::new(),
        }
    }
}

impl From<CaseSeed> for TaggedSeed {
    fn from(seed: CaseSeed) -> Self {
        TaggedSeed::untagged(seed)
    }
}

/// A portable, content-addressed corpus archive.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CorpusArchive {
    pub manifest: ArchiveManifest,
    pub seeds: Vec<CaseSeed>,
}

impl CorpusArchive {
    /// Builds a verified archive from tagged seeds.
    ///
    /// Seeds and entries are sorted deterministically by `(id, payload)` and
    /// tags are sorted and deduplicated, so building from the same inputs on any
    /// machine yields byte-identical JSON.
    pub fn build_tagged(
        seeds: Vec<TaggedSeed>,
        provenance_tags: Vec<String>,
        coverage_notes: Option<String>,
    ) -> Self {
        let mut sorted = seeds;
        sorted.sort_by(|a, b| {
            a.seed
                .id
                .cmp(&b.seed.id)
                .then_with(|| a.seed.payload.cmp(&b.seed.payload))
        });

        let mut packed = Vec::with_capacity(sorted.len());
        let mut entries = Vec::with_capacity(sorted.len());
        for mut ts in sorted {
            ts.tags.sort();
            ts.tags.dedup();
            entries.push(ArchiveEntry {
                content_hash: seed_content_hash(&ts.seed),
                id: ts.seed.id,
                payload_len: ts.seed.payload.len(),
                tags: ts.tags,
            });
            packed.push(ts.seed);
        }

        let mut prov = provenance_tags;
        prov.sort();
        prov.dedup();

        let mut manifest = ArchiveManifest {
            schema: CORPUS_ARCHIVE_FORMAT_VERSION,
            engine_version: current_engine_version(),
            seed_count: packed.len(),
            entries,
            provenance_tags: prov,
            coverage_notes,
            manifest_hash: String::new(),
        };
        manifest.manifest_hash = compute_manifest_hash(&manifest);

        CorpusArchive {
            manifest,
            seeds: packed,
        }
    }

    /// Builds an archive from untagged seeds using the current engine version.
    pub fn build(seeds: Vec<CaseSeed>, provenance_tags: Vec<String>) -> Self {
        Self::build_tagged(
            seeds.into_iter().map(TaggedSeed::untagged).collect(),
            provenance_tags,
            None,
        )
    }

    /// The archive id (the manifest hash).
    pub fn archive_id(&self) -> &str {
        &self.manifest.manifest_hash
    }

    /// All content hashes present in the archive.
    pub fn content_hashes(&self) -> BTreeSet<String> {
        self.manifest
            .entries
            .iter()
            .map(|e| e.content_hash.clone())
            .collect()
    }

    /// Looks up a seed by its content hash.
    pub fn seed_by_hash(&self, content_hash: &str) -> Option<&CaseSeed> {
        let idx = self
            .manifest
            .entries
            .iter()
            .position(|e| e.content_hash == content_hash)?;
        self.seeds.get(idx)
    }

    /// Verifies internal consistency: supported schema, manifest hash, seed
    /// count, and per-seed content hashes/ids/lengths.
    pub fn verify(&self) -> Result<(), ArchiveError> {
        if !SUPPORTED_ARCHIVE_FORMATS.contains(&self.manifest.schema) {
            return Err(ArchiveError::UnsupportedSchema {
                found: self.manifest.schema,
            });
        }
        if self.manifest.seed_count != self.seeds.len()
            || self.manifest.entries.len() != self.seeds.len()
        {
            return Err(ArchiveError::SeedCountMismatch {
                declared: self.manifest.seed_count,
                entries: self.manifest.entries.len(),
                packed: self.seeds.len(),
            });
        }

        for (index, (entry, seed)) in self
            .manifest
            .entries
            .iter()
            .zip(self.seeds.iter())
            .enumerate()
        {
            if entry.id != seed.id {
                return Err(ArchiveError::EntryMismatch {
                    index,
                    detail: format!("id {} does not match seed id {}", entry.id, seed.id),
                });
            }
            if entry.payload_len != seed.payload.len() {
                return Err(ArchiveError::EntryMismatch {
                    index,
                    detail: format!(
                        "payload_len {} does not match actual {}",
                        entry.payload_len,
                        seed.payload.len()
                    ),
                });
            }
            let actual = seed_content_hash(seed);
            if entry.content_hash != actual {
                return Err(ArchiveError::ContentHashMismatch {
                    index,
                    expected: entry.content_hash.clone(),
                    found: actual,
                });
            }
        }

        let recomputed = compute_manifest_hash(&self.manifest);
        if self.manifest.manifest_hash != recomputed {
            return Err(ArchiveError::ManifestHashMismatch {
                expected: self.manifest.manifest_hash.clone(),
                found: recomputed,
            });
        }
        Ok(())
    }

    /// Serializes the archive to pretty JSON bytes.
    pub fn to_json(&self) -> Result<Vec<u8>, ArchiveError> {
        Ok(serde_json::to_vec_pretty(&self)?)
    }

    /// Parses and verifies an archive from JSON bytes.
    pub fn from_json(bytes: &[u8]) -> Result<Self, ArchiveError> {
        let archive: CorpusArchive = serde_json::from_slice(bytes)?;
        archive.verify()?;
        Ok(archive)
    }
}

/// Canonical, order-stable encoding of the manifest fields that are hashed.
fn manifest_canonical_encoding(manifest: &ArchiveManifest) -> Vec<u8> {
    let mut out = Vec::new();
    push_field(&mut out, "schema", &manifest.schema.to_string());
    push_field(&mut out, "engine_version", &manifest.engine_version);
    push_field(&mut out, "seed_count", &manifest.seed_count.to_string());
    for entry in &manifest.entries {
        push_field(&mut out, "entry_hash", &entry.content_hash);
        push_field(&mut out, "entry_id", &entry.id.to_string());
        push_field(&mut out, "entry_len", &entry.payload_len.to_string());
        for tag in &entry.tags {
            push_field(&mut out, "entry_tag", tag);
        }
    }
    for tag in &manifest.provenance_tags {
        push_field(&mut out, "prov_tag", tag);
    }
    push_field(
        &mut out,
        "coverage",
        manifest.coverage_notes.as_deref().unwrap_or(""),
    );
    out
}

/// Recomputes the manifest hash.
pub fn compute_manifest_hash(manifest: &ArchiveManifest) -> String {
    crate::provenance::sha256_hex(&manifest_canonical_encoding(manifest))
}

fn push_field(out: &mut Vec<u8>, key: &str, value: &str) {
    out.extend_from_slice(key.as_bytes());
    out.push(PAIR_SEP);
    out.extend_from_slice(value.as_bytes());
    out.push(FIELD_SEP);
}

/// Policy controlling how an archive from a different engine version is treated.
///
/// Mirrors the W5-B02 compatibility policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum EngineVersionPolicy {
    /// Reject archives whose `engine_version` differs from the current engine.
    RequireExact,
    /// Skip (do not merge) archives from a different engine version, counting
    /// the skipped seeds in the report. This is the default.
    #[default]
    AllowCompatible,
    /// Merge regardless of engine version.
    Ignore,
}

impl EngineVersionPolicy {
    /// Parses a policy from a CLI-style value.
    pub fn parse(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "require" | "exact" | "strict" => Some(EngineVersionPolicy::RequireExact),
            "compatible" | "skip" | "allow" | "warn" => Some(EngineVersionPolicy::AllowCompatible),
            "ignore" | "any" | "off" => Some(EngineVersionPolicy::Ignore),
            _ => None,
        }
    }
}

/// A local corpus under construction, with provenance recorded per content hash.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CorpusStore {
    pub seeds: Vec<CaseSeed>,
    /// Content hash → sorted provenance tags.
    #[serde(default)]
    pub provenance: BTreeMap<String, Vec<String>>,
}

impl CorpusStore {
    /// Creates an empty store.
    pub fn new() -> Self {
        Self::default()
    }

    /// Creates a store from untagged seeds.
    pub fn from_seeds(seeds: Vec<CaseSeed>) -> Self {
        let mut store = Self::new();
        for seed in seeds {
            store.insert_untagged(seed);
        }
        store
    }

    /// Seeds sorted by `(id, payload)` for deterministic export.
    pub fn sorted_seeds(&self) -> Vec<CaseSeed> {
        let mut out = self.seeds.clone();
        out.sort_by(|a, b| a.id.cmp(&b.id).then_with(|| a.payload.cmp(&b.payload)));
        out
    }

    /// Returns the tags recorded for `content_hash`.
    pub fn tags_for(&self, content_hash: &str) -> &[String] {
        self.provenance
            .get(content_hash)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    fn insert_untagged(&mut self, seed: CaseSeed) {
        let _ = self.insert(seed, Vec::new());
    }

    /// Inserts a seed, unioning provenance tags. Returns `(added, provenance_changed)`.
    fn insert(&mut self, seed: CaseSeed, tags: Vec<String>) -> (bool, bool) {
        let hash = seed_content_hash(&seed);
        let mut prov_changed = false;

        let entry = self.provenance.entry(hash).or_default();
        for tag in tags {
            if !entry.contains(&tag) {
                entry.push(tag);
                prov_changed = true;
            }
        }
        entry.sort();
        entry.dedup();

        let exists = self
            .seeds
            .iter()
            .any(|s| s.id == seed.id && s.payload == seed.payload);
        if exists {
            return (false, prov_changed);
        }
        self.seeds.push(seed);
        (true, prov_changed)
    }

    /// Merges `archive` into the store under `policy`.
    ///
    /// When `dry_run` is set the report is computed but the store is not mutated.
    pub fn merge_archive(
        &mut self,
        archive: &CorpusArchive,
        policy: EngineVersionPolicy,
        current_engine: &str,
        dry_run: bool,
    ) -> Result<MergeReport, ArchiveError> {
        archive.verify()?;

        let engine_compatible = archive.manifest.engine_version == current_engine;
        let mut report = MergeReport {
            archive_id: archive.archive_id().to_string(),
            engine_version: archive.manifest.engine_version.clone(),
            engine_compatible,
            dry_run,
            ..Default::default()
        };

        if !engine_compatible {
            match policy {
                EngineVersionPolicy::RequireExact => {
                    return Err(ArchiveError::EngineMismatch {
                        archive: archive.manifest.engine_version.clone(),
                        current: current_engine.to_string(),
                    });
                }
                EngineVersionPolicy::AllowCompatible => {
                    report.version_skipped = archive.seeds.len();
                    return Ok(report);
                }
                EngineVersionPolicy::Ignore => {}
            }
        }

        for (entry, seed) in archive.manifest.entries.iter().zip(archive.seeds.iter()) {
            if dry_run {
                let exists = self
                    .seeds
                    .iter()
                    .any(|s| s.id == seed.id && s.payload == seed.payload);
                if exists {
                    report.duplicates += 1;
                    let existing = self.tags_for(&entry.content_hash);
                    if entry.tags.iter().any(|t| !existing.contains(t)) {
                        report.provenance_unions += 1;
                    }
                } else {
                    report.added += 1;
                }
            } else {
                let (added, prov_changed) = self.insert(seed.clone(), entry.tags.clone());
                if added {
                    report.added += 1;
                } else {
                    report.duplicates += 1;
                }
                if prov_changed {
                    report.provenance_unions += 1;
                }
            }
        }

        Ok(report)
    }
}

/// Result of merging an archive into a [`CorpusStore`].
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MergeReport {
    /// Archive id that was merged.
    pub archive_id: String,
    /// Engine version recorded by the archive.
    pub engine_version: String,
    /// Whether the archive engine version matched the current engine.
    pub engine_compatible: bool,
    /// Seeds added to the store.
    pub added: usize,
    /// Seeds already present (deduplicated by content hash).
    pub duplicates: usize,
    /// Seeds whose provenance tags grew through the merge.
    pub provenance_unions: usize,
    /// Seeds skipped because the archive engine version was incompatible.
    pub version_skipped: usize,
    /// Whether this was a dry run (no mutation).
    pub dry_run: bool,
}

impl MergeReport {
    /// Human-readable one-line summary.
    pub fn summary(&self) -> String {
        let prefix = if self.dry_run { "dry-run: " } else { "" };
        format!(
            "{}{} added, {} dup, {} provenance union(s), {} version-skipped (engine {}{})",
            prefix,
            self.added,
            self.duplicates,
            self.provenance_unions,
            self.version_skipped,
            self.engine_version,
            if self.engine_compatible {
                ""
            } else {
                ", incompatible"
            }
        )
    }
}

/// Errors from building, verifying or merging a corpus archive.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArchiveError {
    /// JSON parsing/serialization failed.
    Json { message: String },
    /// The archive schema is not supported by this build.
    UnsupportedSchema { found: u32 },
    /// A packed seed's content hash does not match its manifest entry.
    ContentHashMismatch {
        index: usize,
        expected: String,
        found: String,
    },
    /// The `manifest_hash` does not match the recomputed value (tampered).
    ManifestHashMismatch { expected: String, found: String },
    /// Declared seed count disagrees with the entries/packed seeds.
    SeedCountMismatch {
        declared: usize,
        entries: usize,
        packed: usize,
    },
    /// A manifest entry disagrees with its packed seed.
    EntryMismatch { index: usize, detail: String },
    /// The archive engine version is incompatible under `RequireExact`.
    EngineMismatch { archive: String, current: String },
}

impl fmt::Display for ArchiveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ArchiveError::Json { message } => write!(f, "corpus archive JSON error: {message}"),
            ArchiveError::UnsupportedSchema { found } => write!(
                f,
                "unsupported corpus archive schema {found} (supported: {SUPPORTED_ARCHIVE_FORMATS:?})"
            ),
            ArchiveError::ContentHashMismatch {
                index,
                expected,
                found,
            } => write!(
                f,
                "seed[{index}] content hash mismatch: manifest {expected}, recomputed {found} (tampered?)"
            ),
            ArchiveError::ManifestHashMismatch { expected, found } => write!(
                f,
                "manifest hash mismatch: stored {expected}, recomputed {found} (tampered?)"
            ),
            ArchiveError::SeedCountMismatch {
                declared,
                entries,
                packed,
            } => write!(
                f,
                "seed count mismatch: manifest declares {declared}, {entries} entries, {packed} packed seeds"
            ),
            ArchiveError::EntryMismatch { index, detail } => {
                write!(f, "manifest entry[{index}] mismatch: {detail}")
            }
            ArchiveError::EngineMismatch { archive, current } => write!(
                f,
                "archive engine version {archive} is incompatible with current engine {current}"
            ),
        }
    }
}

impl std::error::Error for ArchiveError {}

impl From<serde_json::Error> for ArchiveError {
    fn from(e: serde_json::Error) -> Self {
        ArchiveError::Json {
            message: e.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(id: u64, payload: &[u8]) -> CaseSeed {
        CaseSeed {
            id,
            payload: payload.to_vec(),
        }
    }

    fn tagged(id: u64, payload: &[u8], tags: &[&str]) -> TaggedSeed {
        TaggedSeed {
            seed: seed(id, payload),
            tags: tags.iter().map(|s| s.to_string()).collect(),
        }
    }

    // ── build / verify ────────────────────────────────────────────────────────

    #[test]
    fn build_records_engine_version_and_count() {
        let arch = CorpusArchive::build(vec![seed(1, &[1, 2]), seed(2, &[3])], vec![]);
        assert_eq!(arch.manifest.schema, CORPUS_ARCHIVE_FORMAT_VERSION);
        assert_eq!(arch.manifest.engine_version, current_engine_version());
        assert_eq!(arch.manifest.seed_count, 2);
        assert_eq!(arch.manifest.entries.len(), 2);
        arch.verify().expect("fresh archive verifies");
    }

    #[test]
    fn manifest_hash_is_stable_regardless_of_input_order() {
        let a = CorpusArchive::build(vec![seed(2, &[3]), seed(1, &[1, 2])], vec![]);
        let b = CorpusArchive::build(vec![seed(1, &[1, 2]), seed(2, &[3])], vec![]);
        assert_eq!(a.archive_id(), b.archive_id());
        assert_eq!(a.to_json().unwrap(), b.to_json().unwrap());
    }

    #[test]
    fn round_trip_export_import() {
        let arch = CorpusArchive::build_tagged(
            vec![tagged(1, &[1, 2, 3], &["team-a"]), tagged(2, &[9], &[])],
            vec!["campaign-7".to_string()],
            Some("covers auth + budget".to_string()),
        );
        let bytes = arch.to_json().unwrap();
        let back = CorpusArchive::from_json(&bytes).unwrap();
        assert_eq!(arch, back);
        back.verify().unwrap();
    }

    #[test]
    fn tags_are_sorted_and_deduplicated() {
        let arch = CorpusArchive::build_tagged(
            vec![tagged(1, &[1], &["b", "a", "b"])],
            vec!["z".into(), "a".into(), "z".into()],
            None,
        );
        assert_eq!(arch.manifest.entries[0].tags, vec!["a", "b"]);
        assert_eq!(arch.manifest.provenance_tags, vec!["a", "z"]);
    }

    // ── tamper detection ──────────────────────────────────────────────────────

    #[test]
    fn tampered_payload_is_rejected() {
        let mut arch = CorpusArchive::build(vec![seed(1, &[1, 2, 3])], vec![]);
        arch.seeds[0].payload[0] ^= 0xFF; // tamper in place after sealing
        match arch.verify() {
            Err(ArchiveError::ContentHashMismatch { index, .. }) => assert_eq!(index, 0),
            other => panic!("expected ContentHashMismatch, got {other:?}"),
        }
    }

    #[test]
    fn tampered_manifest_hash_is_rejected() {
        let mut arch = CorpusArchive::build(vec![seed(1, &[1, 2, 3])], vec![]);
        arch.manifest.engine_version = "9.9.9".to_string(); // invalidates manifest hash
        match arch.verify() {
            Err(ArchiveError::ManifestHashMismatch { .. }) => {}
            other => panic!("expected ManifestHashMismatch, got {other:?}"),
        }
    }

    #[test]
    fn unsupported_schema_is_rejected() {
        let mut arch = CorpusArchive::build(vec![seed(1, &[1])], vec![]);
        arch.manifest.schema = 999;
        match arch.verify() {
            Err(ArchiveError::UnsupportedSchema { found }) => assert_eq!(found, 999),
            other => panic!("expected UnsupportedSchema, got {other:?}"),
        }
    }

    #[test]
    fn seed_count_mismatch_is_rejected() {
        let mut arch = CorpusArchive::build(vec![seed(1, &[1])], vec![]);
        arch.manifest.seed_count = 5;
        match arch.verify() {
            Err(ArchiveError::SeedCountMismatch { declared, .. }) => assert_eq!(declared, 5),
            other => panic!("expected SeedCountMismatch, got {other:?}"),
        }
    }

    #[test]
    fn entry_id_mismatch_is_rejected() {
        let mut arch = CorpusArchive::build(vec![seed(1, &[1])], vec![]);
        arch.manifest.entries[0].id = 42;
        match arch.verify() {
            Err(ArchiveError::EntryMismatch { index, .. }) => assert_eq!(index, 0),
            other => panic!("expected EntryMismatch, got {other:?}"),
        }
    }

    #[test]
    fn from_json_rejects_tampered_bytes() {
        let arch = CorpusArchive::build(vec![seed(1, &[1, 2, 3])], vec![]);
        let mut value: serde_json::Value =
            serde_json::from_slice(&arch.to_json().unwrap()).unwrap();
        value["seeds"][0]["payload"][0] = serde_json::json!(255);
        let bytes = serde_json::to_vec(&value).unwrap();
        assert!(CorpusArchive::from_json(&bytes).is_err());
    }

    // ── merge semantics ───────────────────────────────────────────────────────

    #[test]
    fn merge_adds_new_seeds() {
        let mut store = CorpusStore::from_seeds(vec![seed(1, &[1])]);
        let arch = CorpusArchive::build(vec![seed(1, &[1]), seed(2, &[2])], vec![]);
        let report = store
            .merge_archive(
                &arch,
                EngineVersionPolicy::AllowCompatible,
                &current_engine_version(),
                false,
            )
            .unwrap();
        assert_eq!(report.added, 1);
        assert_eq!(report.duplicates, 1);
        assert_eq!(store.seeds.len(), 2);
    }

    #[test]
    fn merge_dedups_identical_content() {
        let mut store = CorpusStore::new();
        let arch = CorpusArchive::build(vec![seed(1, &[1]), seed(2, &[2])], vec![]);
        let first = store
            .merge_archive(
                &arch,
                EngineVersionPolicy::AllowCompatible,
                &current_engine_version(),
                false,
            )
            .unwrap();
        let second = store
            .merge_archive(
                &arch,
                EngineVersionPolicy::AllowCompatible,
                &current_engine_version(),
                false,
            )
            .unwrap();
        assert_eq!(first.added, 2);
        assert_eq!(second.added, 0);
        assert_eq!(second.duplicates, 2);
        assert_eq!(store.seeds.len(), 2);
    }

    #[test]
    fn same_hash_different_provenance_unions_tags() {
        let mut store = CorpusStore::new();
        let a = CorpusArchive::build_tagged(vec![tagged(1, &[1, 2], &["team-a"])], vec![], None);
        let b = CorpusArchive::build_tagged(vec![tagged(1, &[1, 2], &["team-b"])], vec![], None);

        let ra = store
            .merge_archive(
                &a,
                EngineVersionPolicy::AllowCompatible,
                &current_engine_version(),
                false,
            )
            .unwrap();
        let rb = store
            .merge_archive(
                &b,
                EngineVersionPolicy::AllowCompatible,
                &current_engine_version(),
                false,
            )
            .unwrap();

        assert_eq!(ra.added, 1);
        assert_eq!(rb.duplicates, 1);
        assert_eq!(rb.provenance_unions, 1);
        let hash = seed_content_hash(&seed(1, &[1, 2]));
        assert_eq!(
            store.tags_for(&hash),
            &["team-a".to_string(), "team-b".to_string()]
        );
    }

    #[test]
    fn dry_run_reports_without_mutating() {
        let mut store = CorpusStore::from_seeds(vec![seed(1, &[1])]);
        let arch = CorpusArchive::build(vec![seed(1, &[1]), seed(2, &[2])], vec![]);
        let report = store
            .merge_archive(
                &arch,
                EngineVersionPolicy::AllowCompatible,
                &current_engine_version(),
                true,
            )
            .unwrap();
        assert!(report.dry_run);
        assert_eq!(report.added, 1);
        assert_eq!(report.duplicates, 1);
        assert_eq!(store.seeds.len(), 1, "dry-run must not mutate the store");
    }

    // ── engine-version policy ─────────────────────────────────────────────────

    fn archive_with_engine(engine: &str) -> CorpusArchive {
        let mut arch = CorpusArchive::build(vec![seed(1, &[1])], vec![]);
        arch.manifest.engine_version = engine.to_string();
        arch.manifest.manifest_hash = compute_manifest_hash(&arch.manifest);
        arch
    }

    #[test]
    fn require_exact_rejects_engine_mismatch() {
        let mut store = CorpusStore::new();
        let arch = archive_with_engine("0.0.1-different");
        let err = store
            .merge_archive(
                &arch,
                EngineVersionPolicy::RequireExact,
                &current_engine_version(),
                false,
            )
            .unwrap_err();
        match err {
            ArchiveError::EngineMismatch { archive, .. } => {
                assert_eq!(archive, "0.0.1-different")
            }
            other => panic!("expected EngineMismatch, got {other:?}"),
        }
        assert!(store.seeds.is_empty());
    }

    #[test]
    fn allow_compatible_skips_engine_mismatch() {
        let mut store = CorpusStore::new();
        let arch = archive_with_engine("0.0.1-different");
        let report = store
            .merge_archive(
                &arch,
                EngineVersionPolicy::AllowCompatible,
                &current_engine_version(),
                false,
            )
            .unwrap();
        assert!(!report.engine_compatible);
        assert_eq!(report.version_skipped, 1);
        assert_eq!(report.added, 0);
        assert!(store.seeds.is_empty());
    }

    #[test]
    fn ignore_merges_across_engine_versions() {
        let mut store = CorpusStore::new();
        let arch = archive_with_engine("0.0.1-different");
        let report = store
            .merge_archive(
                &arch,
                EngineVersionPolicy::Ignore,
                &current_engine_version(),
                false,
            )
            .unwrap();
        assert!(!report.engine_compatible);
        assert_eq!(report.added, 1);
        assert_eq!(store.seeds.len(), 1);
    }

    #[test]
    fn engine_policy_parsing() {
        assert_eq!(
            EngineVersionPolicy::parse("require"),
            Some(EngineVersionPolicy::RequireExact)
        );
        assert_eq!(
            EngineVersionPolicy::parse("SKIP"),
            Some(EngineVersionPolicy::AllowCompatible)
        );
        assert_eq!(
            EngineVersionPolicy::parse("any"),
            Some(EngineVersionPolicy::Ignore)
        );
        assert_eq!(EngineVersionPolicy::parse("nonsense"), None);
    }
}
