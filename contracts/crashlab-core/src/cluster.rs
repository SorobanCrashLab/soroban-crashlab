//! Hierarchical failure clustering for large fuzzing campaigns.
//!
//! A single bug manifests across many seeds with different addresses,
//! calldata, and amounts, producing a different *raw* signature each time.
//! Flooding responders with millions of these raw signatures makes triage
//! impossible. This module reduces them to a small set of **triage units**
//! (clusters) using a three-level hierarchy:
//!
//! | Level | Meaning                                                            |
//! |-------|--------------------------------------------------------------------|
//! | L1    | [`FailureClass`] taxonomy domain (auth, budget, state, xdr, …)      |
//! | L2    | **normalized** signature — volatile parts masked, shape preserved   |
//! | L3    | raw signature variance — the concrete preimages inside a cluster    |
//!
//! Two observations land in the same cluster if and only if they share the
//! same L1 class *and* the same L2 normalized signature. Distinct bugs —
//! different classes or different normalized shapes — can never merge, which
//! is enforced by the golden separation tests below.
//!
//! ## Normalization
//!
//! [`normalize_signature`] applies a versioned, configurable set of masking
//! rules to a signature preimage:
//!
//! * addresses → `Address@<ordinal>` (ordinal by first appearance)
//! * hashes    → `Hash@<ordinal>`
//! * amounts   → `i128:1e18-magnitude-bucket` / `u128:…`
//!
//! The rules carry a [`NormalizationRules::rules_version`] and record the
//! [`crate::taxonomy::TAXONOMY_VERSION`] they were produced against, so a
//! rules change deterministically re-clusters rather than silently merging.
//!
//! ## Example
//!
//! ```rust
//! use crashlab_core::cluster::{cluster_observations, FailureObservation, NormalizationRules};
//! use crashlab_core::taxonomy::FailureClass;
//!
//! let rules = NormalizationRules::v1();
//! let observations = vec![
//!     FailureObservation::new(FailureClass::Auth, "transfer from 0xAA04 addr", 1, 8, 100),
//!     FailureObservation::new(FailureClass::Auth, "transfer from 0xBB03 addr", 2, 8, 200),
//! ];
//! let store = cluster_observations(&observations, rules);
//! assert_eq!(store.cluster_count(), 2);
//! ```

use crate::signature_hash::hash_normalized_signature;
use crate::taxonomy::{FailureClass, TAXONOMY_VERSION};
use regex::{Captures, Regex};
use std::collections::{BTreeMap, HashMap};
use std::sync::OnceLock;

/// Version of the shipped normalization rule set.
///
/// Bump this whenever masking behaviour changes so persisted clusters can be
/// distinguished from clusters produced by an older rule set.
pub const NORMALIZATION_RULES_VERSION: u32 = 1;

/// Default minimum digit count for masking *bare* (untagged) integer amounts.
///
/// Small integers often encode error codes or enum discriminants and are left
/// untouched; only numbers large enough to plausibly be amounts are bucketed.
pub const DEFAULT_AMOUNT_MIN_DIGITS: usize = 7;

/// Configurable, versioned normalization rules.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct NormalizationRules {
    /// Version of this rule set (see [`NORMALIZATION_RULES_VERSION`]).
    pub rules_version: u32,
    /// Taxonomy version these rules were authored against.
    pub taxonomy_version: u32,
    /// Mask address-like tokens (`0x…` 40-byte hex and Stellar strkey).
    pub mask_addresses: bool,
    /// Mask amount-like numbers into magnitude buckets.
    pub mask_amounts: bool,
    /// Mask hash-like tokens (`0x…` or bare 32-byte hex).
    pub mask_hashes: bool,
    /// Minimum digits before a *bare* integer is treated as an amount.
    pub amount_min_digits: usize,
}

impl Default for NormalizationRules {
    fn default() -> Self {
        Self::v1()
    }
}

impl NormalizationRules {
    /// The shipped default rule set.
    pub fn v1() -> Self {
        Self {
            rules_version: NORMALIZATION_RULES_VERSION,
            taxonomy_version: TAXONOMY_VERSION,
            mask_addresses: true,
            mask_amounts: true,
            mask_hashes: true,
            amount_min_digits: DEFAULT_AMOUNT_MIN_DIGITS,
        }
    }
}

/// A normalized signature with the rule-set version that produced it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedSignature {
    /// Normalized text with volatile parts replaced by shape placeholders.
    pub text: String,
    /// Version of the rule set used to normalize.
    pub rules_version: u32,
}

fn hash_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // 0x-prefixed or bare 32-byte (64 hex char) hashes.
        Regex::new(r"\b(?:0x)?[0-9a-fA-F]{64}\b").expect("valid hash regex")
    })
}

fn address_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // 0x-prefixed 20-byte (40 hex char) addresses, or Stellar strkeys.
        Regex::new(r"\b(?:0x[0-9a-fA-F]{40}|[GC][A-Z2-7]{55})\b").expect("valid address regex")
    })
}

fn bare_amount_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\b\d+\b").expect("valid amount regex"))
}

fn typed_amount_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\b(i128|u128):(\d+)\b").expect("valid typed amount regex"))
}

/// Replaces every match of `re` with `format!("{label}@{ordinal}")`, where the
/// ordinal is assigned by first appearance of the *distinct* matched value.
///
/// This preserves structural shape: two preimages that differ only in the
/// concrete address/hash values normalize to the identical placeholder string.
fn mask_ordinals(input: &str, re: &Regex, label: &str) -> String {
    let mut seen: HashMap<String, usize> = HashMap::new();
    let mut next = 0usize;
    re.replace_all(input, |caps: &Captures| {
        let value = caps[0].to_string();
        let ordinal = *seen.entry(value).or_insert_with(|| {
            let assigned = next;
            next += 1;
            assigned
        });
        format!("{label}@{ordinal}")
    })
    .into_owned()
}

/// Computes the `10^k` magnitude bucket of a decimal magnitude.
fn magnitude_bucket(value: f64) -> u32 {
    if value < 1.0 {
        return 0;
    }
    value.log10().floor() as u32
}

/// Buckets a decimal digit string into `"1e<exp>-magnitude-bucket"`.
fn bucket_digits(prefix: &str, digits: &str) -> String {
    let parsed: f64 = digits.parse().unwrap_or(0.0);
    let bucket = magnitude_bucket(parsed);
    format!("{prefix}:1e{bucket}-magnitude-bucket")
}

/// Normalizes a raw signature preimage by masking volatile address, hash, and
/// amount tokens while preserving the structural shape of the signature.
pub fn normalize_signature(raw: &str, rules: &NormalizationRules) -> NormalizedSignature {
    let mut text = raw.to_string();

    if rules.mask_hashes {
        text = mask_ordinals(&text, hash_re(), "Hash");
    }
    if rules.mask_addresses {
        text = mask_ordinals(&text, address_re(), "Address");
    }
    if rules.mask_amounts {
        // Typed amounts are always bucketed; bare integers only once they are
        // long enough to plausibly be amounts.
        let min_digits = rules.amount_min_digits;
        text = typed_amount_re()
            .replace_all(&text, |caps: &Captures| {
                bucket_digits(&caps[1], &caps[2])
            })
            .into_owned();
        text = bare_amount_re()
            .replace_all(&text, |caps: &Captures| {
                let digits = &caps[0];
                if digits.len() >= min_digits {
                    bucket_digits("i128", digits)
                } else {
                    digits.to_string()
                }
            })
            .into_owned();
    }

    NormalizedSignature {
        text,
        rules_version: rules.rules_version,
    }
}

/// Hierarchical cluster key: L1 taxonomy class + L2 normalized signature.
///
/// The rule-set version participates in the ordering so clusters produced by
/// different rule versions are never conflated.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ClusterKey {
    /// L1: taxonomy domain.
    pub taxonomy_class: FailureClass,
    /// Rule-set version used to produce the normalized signature.
    pub rules_version: u32,
    /// L2: normalized signature text.
    pub normalized_signature: String,
}

impl ClusterKey {
    /// Builds a key from an L1 class, a raw preimage, and normalization rules.
    pub fn new(
        taxonomy_class: FailureClass,
        raw_preimage: &str,
        rules: &NormalizationRules,
    ) -> Self {
        let normalized = normalize_signature(raw_preimage, rules);
        Self {
            taxonomy_class,
            rules_version: normalized.rules_version,
            normalized_signature: normalized.text,
        }
    }
}

/// A single observed failure, ready to be ingested into a [`ClusterStore`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FailureObservation {
    /// L1 taxonomy domain of the failure.
    pub taxonomy_class: FailureClass,
    /// L3: raw, un-normalized signature preimage.
    pub raw_signature: String,
    /// Stable seed identifier.
    pub seed_id: u64,
    /// Length of the (possibly shrunk) seed payload — used to pick the exemplar.
    pub seed_payload_len: usize,
    /// Monotonic observation timestamp used for first/last seen bounds.
    pub observed_at: u64,
}

impl FailureObservation {
    /// Convenience constructor.
    pub fn new(
        taxonomy_class: FailureClass,
        raw_signature: impl Into<String>,
        seed_id: u64,
        seed_payload_len: usize,
        observed_at: u64,
    ) -> Self {
        Self {
            taxonomy_class,
            raw_signature: raw_signature.into(),
            seed_id,
            seed_payload_len,
            observed_at,
        }
    }
}

/// L3: a concrete member of a cluster (one raw variance instance).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ClusterMember {
    /// Seed that produced this observation.
    pub seed_id: u64,
    /// Payload length of that seed (exemplar selection, drill-down display).
    pub seed_payload_len: usize,
    /// Raw signature preimage.
    pub raw_signature: String,
    /// When this member was observed.
    pub observed_at: u64,
}

/// A hierarchical failure cluster (a single triage unit).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct FailureCluster {
    /// Deterministic, stable cluster identifier.
    pub id: String,
    /// L1 taxonomy class label (stable across crate versions).
    pub taxonomy_class: String,
    /// L2 normalized signature shared by every member.
    pub normalized_signature: String,
    /// Rule-set version used to normalize.
    pub rules_version: u32,
    /// Number of observations in this cluster.
    pub count: u64,
    /// Exemplar seed: the smallest observed seed in the cluster.
    pub exemplar_seed_id: u64,
    /// Payload length of the exemplar seed.
    pub exemplar_payload_len: usize,
    /// Raw signature of the exemplar.
    pub exemplar_raw_signature: String,
    /// Earliest observation timestamp in the cluster.
    pub first_seen: u64,
    /// Latest observation timestamp in the cluster.
    pub last_seen: u64,
    /// L3 members with their raw variance.
    pub members: Vec<ClusterMember>,
}

impl FailureCluster {
    fn new(key: &ClusterKey, obs: &FailureObservation) -> Self {
        let taxonomy_class = key.taxonomy_class.as_str().to_string();
        Self {
            id: cluster_id(&taxonomy_class, &key.normalized_signature, key.rules_version),
            taxonomy_class,
            normalized_signature: key.normalized_signature.clone(),
            rules_version: key.rules_version,
            count: 0,
            exemplar_seed_id: obs.seed_id,
            exemplar_payload_len: obs.seed_payload_len,
            exemplar_raw_signature: obs.raw_signature.clone(),
            first_seen: obs.observed_at,
            last_seen: obs.observed_at,
            members: Vec::new(),
        }
    }

    /// True when `obs` is "smaller" than the current exemplar and should
    /// replace it. Smaller payload wins; ties break on lower seed id.
    fn obs_beats_exemplar(&self, obs: &FailureObservation) -> bool {
        (obs.seed_payload_len, obs.seed_id) < (self.exemplar_payload_len, self.exemplar_seed_id)
    }

    /// Recomputes the exemplar from the current member list.
    fn recompute_exemplar(&mut self) {
        if let Some(best) = self
            .members
            .iter()
            .min_by_key(|m| (m.seed_payload_len, m.seed_id))
        {
            self.exemplar_seed_id = best.seed_id;
            self.exemplar_payload_len = best.seed_payload_len;
            self.exemplar_raw_signature = best.raw_signature.clone();
        }
    }
}

/// Deterministic cluster id derived from the stable signature hash.
fn cluster_id(taxonomy_class: &str, normalized: &str, rules_version: u32) -> String {
    let hash = hash_normalized_signature(taxonomy_class, normalized);
    format!("{taxonomy_class}:{hash:016x}:v{rules_version}")
}

/// In-memory cluster store: aggregates observations into hierarchical clusters
/// and persists counts plus first/last-seen bounds.
#[derive(Debug, Clone)]
pub struct ClusterStore {
    rules: NormalizationRules,
    clusters: BTreeMap<ClusterKey, FailureCluster>,
    total_observations: u64,
}

impl Default for ClusterStore {
    fn default() -> Self {
        Self::new(NormalizationRules::v1())
    }
}

impl ClusterStore {
    /// Creates an empty store using `rules` for normalization.
    pub fn new(rules: NormalizationRules) -> Self {
        Self {
            rules,
            clusters: BTreeMap::new(),
            total_observations: 0,
        }
    }

    /// Normalization rules backing this store.
    pub fn rules(&self) -> &NormalizationRules {
        &self.rules
    }

    /// Number of distinct clusters.
    pub fn cluster_count(&self) -> usize {
        self.clusters.len()
    }

    /// Total observations ingested, including duplicates.
    pub fn total_observations(&self) -> u64 {
        self.total_observations
    }

    /// Ingest a single observation, creating or extending the matching cluster.
    pub fn ingest(&mut self, obs: &FailureObservation) {
        let key = ClusterKey::new(obs.taxonomy_class, &obs.raw_signature, &self.rules);
        self.total_observations += 1;

        let member = ClusterMember {
            seed_id: obs.seed_id,
            seed_payload_len: obs.seed_payload_len,
            raw_signature: obs.raw_signature.clone(),
            observed_at: obs.observed_at,
        };

        match self.clusters.get_mut(&key) {
            Some(cluster) => {
                cluster.count += 1;
                cluster.first_seen = cluster.first_seen.min(obs.observed_at);
                cluster.last_seen = cluster.last_seen.max(obs.observed_at);
                if cluster.obs_beats_exemplar(obs) {
                    cluster.exemplar_seed_id = obs.seed_id;
                    cluster.exemplar_payload_len = obs.seed_payload_len;
                    cluster.exemplar_raw_signature = obs.raw_signature.clone();
                }
                cluster.members.push(member);
            }
            None => {
                let mut cluster = FailureCluster::new(&key, obs);
                cluster.count = 1;
                cluster.members.push(member);
                self.clusters.insert(key, cluster);
            }
        }
    }

    /// All clusters, ordered by descending count then ascending normalized
    /// signature (deterministic triage ordering).
    pub fn clusters(&self) -> Vec<&FailureCluster> {
        let mut all: Vec<&FailureCluster> = self.clusters.values().collect();
        all.sort_by(|a, b| {
            b.count
                .cmp(&a.count)
                .then_with(|| a.normalized_signature.cmp(&b.normalized_signature))
                .then_with(|| a.taxonomy_class.cmp(&b.taxonomy_class))
        });
        all
    }

    /// Clusters restricted to a single taxonomy class.
    pub fn clusters_for_class(&self, class: FailureClass) -> Vec<&FailureCluster> {
        self.clusters()
            .into_iter()
            .filter(|c| c.taxonomy_class == class.as_str())
            .collect()
    }

    /// Looks up the cluster that a raw observation would belong to.
    pub fn cluster_for(&self, obs: &FailureObservation) -> Option<&FailureCluster> {
        let key = ClusterKey::new(obs.taxonomy_class, &obs.raw_signature, &self.rules);
        self.clusters.get(&key)
    }

    /// Serializable snapshot for persistence.
    pub fn snapshot(&self) -> ClusterSnapshot {
        ClusterSnapshot {
            rules_version: self.rules.rules_version,
            clusters: self.clusters().into_iter().cloned().collect(),
        }
    }

    /// Restores a store from a persisted snapshot, recomputing exemplars.
    pub fn from_snapshot(mut snapshot: ClusterSnapshot, rules: NormalizationRules) -> Self {
        let mut clusters = BTreeMap::new();
        let mut total = 0u64;
        for mut cluster in snapshot.clusters.drain(..) {
            total += cluster.count;
            cluster.recompute_exemplar();
            if let Some(class) = FailureClass::from_category_label(&cluster.taxonomy_class) {
                let key = ClusterKey {
                    taxonomy_class: class,
                    rules_version: cluster.rules_version,
                    normalized_signature: cluster.normalized_signature.clone(),
                };
                clusters.insert(key, cluster);
            }
        }
        Self {
            rules,
            clusters,
            total_observations: total,
        }
    }
}

/// Serializable cluster-store snapshot.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClusterSnapshot {
    /// Rule-set version that produced the snapshot.
    pub rules_version: u32,
    /// Persisted clusters (counts + first/last seen + members).
    pub clusters: Vec<FailureCluster>,
}

/// Convenience helper: builds a store from a batch of observations.
pub fn cluster_observations(
    observations: &[FailureObservation],
    rules: NormalizationRules,
) -> ClusterStore {
    let mut store = ClusterStore::new(rules);
    for obs in observations {
        store.ingest(obs);
    }
    store
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn addr(hex40: &str) -> String {
        format!("0x{hex40:0<40}")
    }

    // ── Normalization ────────────────────────────────────────────────────────

    #[test]
    fn masks_addresses_with_ordinals() {
        let rules = NormalizationRules::v1();
        let preimage = format!(
            "transfer from={} to={}",
            addr("aaaa"),
            addr("bbbb")
        );
        let normalized = normalize_signature(&preimage, &rules);
        assert_eq!(normalized.text, "transfer from=Address@0 to=Address@1");
    }

    #[test]
    fn collapses_distinct_address_values_into_identical_shape() {
        let rules = NormalizationRules::v1();
        let a = normalize_signature(&format!("call from={}", addr("1111")), &rules);
        let b = normalize_signature(&format!("call from={}", addr("2222")), &rules);
        assert_eq!(a.text, b.text);
    }

    #[test]
    fn masks_typed_amounts_into_magnitude_buckets() {
        let rules = NormalizationRules::v1();
        let n = normalize_signature("debit i128:1000000000000000000", &rules);
        assert_eq!(n.text, "debit i128:1e18-magnitude-bucket");
    }

    #[test]
    fn typed_amounts_in_same_magnitude_collapse() {
        let rules = NormalizationRules::v1();
        let a = normalize_signature("debit i128:5000000", &rules);
        let b = normalize_signature("debit i128:8000000", &rules);
        assert_eq!(a.text, b.text);
        assert_eq!(a.text, "debit i128:1e6-magnitude-bucket");
    }

    #[test]
    fn masks_hashes_with_ordinals() {
        let rules = NormalizationRules::v1();
        let h = format!("0x{}", "ab".repeat(32));
        let n = normalize_signature(&format!("root={h}"), &rules);
        assert_eq!(n.text, "root=Hash@0");
    }

    #[test]
    fn leaves_small_integers_intact_by_default() {
        let rules = NormalizationRules::v1();
        let n = normalize_signature("error code 404", &rules);
        assert_eq!(n.text, "error code 404");
    }

    #[test]
    fn rules_version_is_recorded() {
        let rules = NormalizationRules::v1();
        let n = normalize_signature("anything", &rules);
        assert_eq!(n.rules_version, NORMALIZATION_RULES_VERSION);
        assert_eq!(rules.taxonomy_version, TAXONOMY_VERSION);
    }

    // ── Address variants → one cluster ───────────────────────────────────────

    #[test]
    fn address_variants_merge_into_one_cluster() {
        let rules = NormalizationRules::v1();
        // Same bug: same class and structure, N different address values.
        let observations: Vec<FailureObservation> = (0..64)
            .map(|i| {
                let from = addr(&format!("{i:04x}"));
                let to = addr(&format!("{:04x}", i + 1));
                FailureObservation::new(
                    FailureClass::Auth,
                    format!("sig:token:transfer:from={from}:to={to}"),
                    i,
                    32,
                    1_000 + i,
                )
            })
            .collect();

        let store = cluster_observations(&observations, rules);
        assert_eq!(store.cluster_count(), 1, "address variants must share a cluster");
        let cluster = &store.clusters()[0];
        assert_eq!(cluster.count, 64);
        assert_eq!(cluster.taxonomy_class, "auth");
        assert_eq!(cluster.first_seen, 1_000);
        assert_eq!(cluster.last_seen, 1_063);
        // Exemplar is the smallest seed (payload lengths tie → lowest seed id).
        assert_eq!(cluster.exemplar_seed_id, 0);
    }

    // ── Golden separation: distinct bugs never merge ─────────────────────────

    #[test]
    fn distinct_bugs_never_merge() {
        let rules = NormalizationRules::v1();

        let observations = vec![
            // Group A: transfer with from/to addresses (0xAAAA / 0xBBBB).
            FailureObservation::new(
                FailureClass::Auth,
                format!("sig:token:transfer:from={}:to={}", addr("aaaa"), addr("bbbb")),
                1,
                24,
                10,
            ),
            // Group A': same structure, different addresses → merges with A.
            FailureObservation::new(
                FailureClass::Auth,
                format!("sig:token:transfer:from={}:to={}", addr("cccc"), addr("dddd")),
                2,
                24,
                20,
            ),
            // Group B: different structure (amount only) → separate.
            FailureObservation::new(
                FailureClass::Auth,
                "sig:token:transfer:amount=i128:1000000".to_string(),
                3,
                16,
                30,
            ),
            // Group B': same structure, same magnitude bucket → merges with B.
            FailureObservation::new(
                FailureClass::Auth,
                "sig:token:transfer:amount=i128:9999999".to_string(),
                4,
                16,
                40,
            ),
            // Group C: different class and structure → separate.
            FailureObservation::new(
                FailureClass::State,
                "sig:vault:rebalance:unwrap_budget_snapshot".to_string(),
                5,
                12,
                50,
            ),
        ];

        let store = cluster_observations(&observations, rules);
        assert_eq!(store.cluster_count(), 3, "golden separation set");

        let counts: Vec<u64> = {
            let mut c: Vec<u64> = store.clusters().into_iter().map(|x| x.count).collect();
            c.sort_unstable();
            c
        };
        assert_eq!(counts, vec![1, 2, 2]);
        assert_eq!(store.total_observations(), 5);
    }

    #[test]
    fn same_class_but_different_normalized_signature_does_not_merge() {
        let rules = NormalizationRules::v1();
        let a = FailureObservation::new(FailureClass::Auth, "sig:a:one", 1, 4, 1);
        let b = FailureObservation::new(FailureClass::Auth, "sig:a:two", 2, 4, 2);
        let store = cluster_observations(&[a, b], rules);
        assert_eq!(store.cluster_count(), 2);
    }

    #[test]
    fn exact_duplicates_accumulate_without_new_clusters() {
        let rules = NormalizationRules::v1();
        let obs = FailureObservation::new(FailureClass::Budget, "sig:budget:cpu", 1, 4, 1);
        let store = cluster_observations(&[obs.clone(), obs], rules);
        assert_eq!(store.cluster_count(), 1);
        assert_eq!(store.clusters()[0].count, 2);
    }

    // ── Exemplar selection & persistence ─────────────────────────────────────

    #[test]
    fn exemplar_is_the_smallest_seed() {
        let rules = NormalizationRules::v1();
        let observations = vec![
            FailureObservation::new(FailureClass::Auth, "sig:x:y", 7, 100, 1),
            FailureObservation::new(FailureClass::Auth, "sig:x:y", 9, 20, 2),
            FailureObservation::new(FailureClass::Auth, "sig:x:y", 3, 50, 3),
        ];
        let report = cluster_observations(&observations, rules);
        let cluster = &report.clusters()[0];
        assert_eq!(cluster.exemplar_seed_id, 9);
        assert_eq!(cluster.exemplar_payload_len, 20);
    }

    #[test]
    fn snapshot_round_trips_counts_and_bounds() {
        let rules = NormalizationRules::v1();
        let observations = vec![
            FailureObservation::new(FailureClass::Auth, "sig:x:y", 1, 10, 100),
            FailureObservation::new(FailureClass::Auth, "sig:x:y", 2, 10, 250),
        ];
        let store = cluster_observations(&observations, rules.clone());
        let snapshot = store.snapshot();
        let restored = ClusterStore::from_snapshot(snapshot, rules);

        assert_eq!(restored.cluster_count(), 1);
        let c = &restored.clusters()[0];
        assert_eq!(c.count, 2);
        assert_eq!(c.first_seen, 100);
        assert_eq!(c.last_seen, 250);
        assert_eq!(c.exemplar_seed_id, 1);
    }

    #[test]
    fn clusters_are_ordered_by_count_desc() {
        let rules = NormalizationRules::v1();
        let mut observations = Vec::new();
        for i in 0..5 {
            observations.push(FailureObservation::new(FailureClass::Auth, "sig:a", i, 4, i));
        }
        for i in 0..2 {
            observations.push(FailureObservation::new(FailureClass::State, "sig:b", 100 + i, 4, i));
        }
        let clusters = cluster_observations(&observations, rules);
        let ordered = clusters.clusters();
        assert_eq!(ordered[0].count, 5);
        assert_eq!(ordered[1].count, 2);
    }

    // ── Scaling ──────────────────────────────────────────────────────────────

    #[test]
    fn clusters_hundred_thousand_signatures_within_bounded_time() {
        const TOTAL: usize = 100_000;
        const TEMPLATES: usize = 20;

        let rules = NormalizationRules::v1();
        let mut store = ClusterStore::new(rules);

        let start = Instant::now();
        for i in 0..TOTAL {
            let template = i % TEMPLATES;
            let raw = format!(
                "sig:bug{template}:call:addr=0x{i:040x}:amount=i128:{}",
                1_000_000 + (i % 1000),
            );
            store.ingest(&FailureObservation::new(
                FailureClass::ALL[template % FailureClass::ALL.len()],
                raw,
                i as u64,
                32,
                i as u64,
            ));
        }
        let elapsed = start.elapsed();

        assert_eq!(store.total_observations(), TOTAL as u64);
        assert_eq!(store.cluster_count(), TEMPLATES);
        assert!(
            elapsed.as_secs() < 20,
            "clustering {TOTAL} signatures took {elapsed:?}, exceeds the 20s bound"
        );
    }

    #[test]
    fn disabled_rules_preserve_raw_text() {
        let rules = NormalizationRules {
            mask_addresses: false,
            mask_amounts: false,
            mask_hashes: false,
            ..NormalizationRules::v1()
        };
        let raw = format!("call from={} amount=i128:1000000", addr("aaaa"));
        let normalized = normalize_signature(&raw, &rules);
        assert_eq!(normalized.text, raw);
    }
}
