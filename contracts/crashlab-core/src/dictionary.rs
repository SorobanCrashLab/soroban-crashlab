//! Soroban pitfall dictionary: curated value pools injected into
//! structurally-aware mutation slots (TTL, archival, depth, metering edges).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

/// Errors produced while loading or querying a dictionary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DictionaryError {
    /// The dictionary document could not be parsed.
    Parse(String),
    /// The dictionary referenced an unsupported schema version.
    UnsupportedSchema(u32),
    /// A pool declared no values.
    EmptyPool(String),
    /// An IO error occurred while reading a dictionary document.
    Io(String),
}

impl fmt::Display for DictionaryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DictionaryError::Parse(msg) => write!(f, "dictionary parse error: {msg}"),
            DictionaryError::UnsupportedSchema(v) => {
                write!(f, "unsupported dictionary schema version: {v}")
            }
            DictionaryError::EmptyPool(name) => write!(f, "dictionary pool '{name}' is empty"),
            DictionaryError::Io(msg) => write!(f, "dictionary io error: {msg}"),
        }
    }
}

impl std::error::Error for DictionaryError {}

/// A single injectable value inside a dictionary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DictionaryEntry {
    /// Human-readable label for the value (also the hit-report key).
    pub label: String,
    /// Pitfall class (e.g. `ttl`, `archival`, `depth`, `metering`).
    pub class: String,
    /// Raw bytes injected into the payload slot.
    pub value: Vec<u8>,
}

/// Identifies a known dictionary shipped with the fuzzer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DictionaryId {
    /// The curated Soroban pitfall dictionary (TTL, archival, depth, metering).
    SorobanPitfalls,
}

/// A named pool of injectable values.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Dictionary {
    /// Dictionary name (e.g. `soroban-pitfalls`).
    pub name: String,
    /// Ordered entries; injection picks uniformly among them.
    pub entries: Vec<DictionaryEntry>,
}

impl Dictionary {
    /// Creates an empty dictionary with the given name.
    pub fn new(name: &str) -> Self {
        Dictionary {
            name: name.to_string(),
            entries: Vec::new(),
        }
    }

    /// Appends a raw byte value under `label` in the default (pitfall) class.
    pub fn push_value(&mut self, label: &str, value: Vec<u8>) {
        self.entries.push(DictionaryEntry {
            label: label.to_string(),
            class: "pitfall".to_string(),
            value,
        });
    }

    /// Appends an entry with an explicit class.
    pub fn push_entry(&mut self, label: &str, class: &str, value: Vec<u8>) {
        self.entries.push(DictionaryEntry {
            label: label.to_string(),
            class: class.to_string(),
            value,
        });
    }

    /// Number of entries in the dictionary.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// True when the dictionary holds no entries.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Returns the raw value at `idx`, if present.
    pub fn value(&self, idx: usize) -> Option<&[u8]> {
        self.entries.get(idx).map(|e| e.value.as_slice())
    }

    /// Returns the entry at `idx`, if present.
    pub fn entry(&self, idx: usize) -> Option<&DictionaryEntry> {
        self.entries.get(idx)
    }

    /// Iterates over all entries.
    pub fn iter(&self) -> impl Iterator<Item = &DictionaryEntry> {
        self.entries.iter()
    }
}

/// Serializable form of a dictionary document (one or more pools).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryDocument {
    /// Schema version of the document.
    pub schema_version: u32,
    /// Flattened pools, each contributing entries.
    #[serde(default)]
    pub pools: Vec<DictionaryPool>,
}

/// A named pool of labeled values inside a document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryPool {
    /// Pool name.
    pub name: String,
    /// Pitfall class shared by every value in the pool.
    #[serde(default)]
    pub class: String,
    /// Labeled raw values (hex-encoded).
    #[serde(default)]
    pub values: Vec<DictionaryValue>,
}

/// A single labeled value inside a pool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryValue {
    /// Label used in hit reports.
    pub label: String,
    /// Hex-encoded raw bytes.
    pub hex: String,
}

/// Loads dictionaries from documents and embedded pitfall pools.
#[derive(Debug, Clone, Default)]
pub struct DictionaryLoader;

impl DictionaryLoader {
    /// Parses a JSON dictionary document into a single flattened [`Dictionary`].
    pub fn from_json(name: &str, json: &str) -> Result<Dictionary, DictionaryError> {
        let doc: DictionaryDocument =
            serde_json::from_str(json).map_err(|e| DictionaryError::Parse(e.to_string()))?;
        Self::from_document(name, doc)
    }

    /// Flattens a document into a single [`Dictionary`].
    pub fn from_document(
        name: &str,
        doc: DictionaryDocument,
    ) -> Result<Dictionary, DictionaryError> {
        if doc.schema_version != 1 {
            return Err(DictionaryError::UnsupportedSchema(doc.schema_version));
        }
        let mut dict = Dictionary::new(name);
        for pool in doc.pools {
            if pool.values.is_empty() {
                return Err(DictionaryError::EmptyPool(pool.name));
            }
            for value in pool.values {
                let raw = hex::decode(value.hex.trim_start_matches("0x"))
                    .map_err(|e| DictionaryError::Parse(format!("{}: {}", value.label, e)))?;
                let class = if pool.class.is_empty() {
                    "pitfall".to_string()
                } else {
                    pool.class.clone()
                };
                dict.push_entry(&value.label, &class, raw);
            }
        }
        Ok(dict)
    }
}

/// Tracks how often each dictionary label was injected.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DictionaryHitTracker {
    hits: HashMap<String, u64>,
}

impl DictionaryHitTracker {
    /// Creates an empty tracker.
    pub fn new() -> Self {
        Self::default()
    }

    /// Records one hit for `label`.
    pub fn record_hit(&mut self, label: &str) {
        *self.hits.entry(label.to_string()).or_insert(0) += 1;
    }

    /// Returns the hit count for `label` (0 when never hit).
    pub fn hits_for(&self, label: &str) -> u64 {
        self.hits.get(label).copied().unwrap_or(0)
    }

    /// Total hits across all labels.
    pub fn total_hits(&self) -> u64 {
        self.hits.values().sum()
    }

    /// Immutable view of per-label counts.
    pub fn counts(&self) -> &HashMap<String, u64> {
        &self.hits
    }

    /// Produces a sorted report of per-label hits.
    pub fn report(&self) -> DictionaryHitReport {
        let mut entries: Vec<(String, u64)> =
            self.hits.iter().map(|(k, v)| (k.clone(), *v)).collect();
        entries.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        DictionaryHitReport {
            total_hits: self.total_hits(),
            entries,
        }
    }
}

/// Immutable snapshot of dictionary hit counts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DictionaryHitReport {
    /// Total hits across every label.
    pub total_hits: u64,
    /// Per-label counts, sorted by descending hits then label.
    pub entries: Vec<(String, u64)>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_and_query_values() {
        let mut dict = Dictionary::new("test");
        dict.push_value("ttl_edge", vec![0xE0, 0x00]);
        assert_eq!(dict.len(), 1);
        assert_eq!(dict.value(0), Some(&[0xE0u8, 0x00][..]));
        assert!(dict.value(1).is_none());
    }

    #[test]
    fn hit_tracker_counts_and_report() {
        let mut tracker = DictionaryHitTracker::new();
        tracker.record_hit("ttl_edge");
        tracker.record_hit("ttl_edge");
        tracker.record_hit("depth_edge");
        assert_eq!(tracker.hits_for("ttl_edge"), 2);
        assert_eq!(tracker.total_hits(), 3);
        let report = tracker.report();
        assert_eq!(report.entries[0], ("ttl_edge".to_string(), 2));
    }

    #[test]
    fn loader_parses_document() {
        let json = r#"{
            "schema_version": 1,
            "pools": [
                {"name": "ttl", "class": "ttl", "values": [
                    {"label": "ttl_min", "hex": "01"}
                ]}
            ]
        }"#;
        let dict = DictionaryLoader::from_json("soroban-pitfalls", json).unwrap();
        assert_eq!(dict.len(), 1);
        assert_eq!(dict.entry(0).unwrap().class, "ttl");
    }

    #[test]
    fn loader_rejects_unknown_schema() {
        let json = r#"{"schema_version": 99, "pools": []}"#;
        let err = DictionaryLoader::from_json("x", json).unwrap_err();
        assert!(matches!(err, DictionaryError::UnsupportedSchema(99)));
    }
}
