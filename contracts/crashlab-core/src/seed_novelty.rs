//! Seed prioritization by novelty (signature and state-diff coverage).

use crate::CaseSeed;
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeedNoveltyCandidate {
    pub seed: CaseSeed,
    pub signature_hash: u64,
    pub state_diff_hash: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoveltyPrioritizer {
    seen_signatures: HashSet<u64>,
    seen_state_diffs: HashSet<u64>,
}

impl NoveltyPrioritizer {
    pub fn new() -> Self {
        Self {
            seen_signatures: HashSet::new(),
            seen_state_diffs: HashSet::new(),
        }
    }

    /// Higher is better. Unseen signature is weighted highest.
    pub fn novelty_score(&self, signature_hash: u64, state_diff_hash: Option<u64>) -> u8 {
        let mut score = 0u8;
        if !self.seen_signatures.contains(&signature_hash) {
            score = score.saturating_add(2);
        }
        if let Some(diff) = state_diff_hash {
            if !self.seen_state_diffs.contains(&diff) {
                score = score.saturating_add(1);
            }
        }
        score
    }

    pub fn record_observation(&mut self, signature_hash: u64, state_diff_hash: Option<u64>) {
        self.seen_signatures.insert(signature_hash);
        if let Some(diff) = state_diff_hash {
            self.seen_state_diffs.insert(diff);
        }
    }

    /// Returns candidate indices sorted by descending novelty score.
    pub fn prioritize_indices(&self, candidates: &[SeedNoveltyCandidate]) -> Vec<usize> {
        let mut order: Vec<usize> = (0..candidates.len()).collect();
        order.sort_by(|&a, &b| {
            let ca = &candidates[a];
            let cb = &candidates[b];
            let sa = self.novelty_score(ca.signature_hash, ca.state_diff_hash);
            let sb = self.novelty_score(cb.signature_hash, cb.state_diff_hash);
            sb.cmp(&sa).then_with(|| ca.seed.id.cmp(&cb.seed.id))
        });
        order
    }

    pub fn unique_signatures_seen(&self) -> usize {
        self.seen_signatures.len()
    }
}

impl Default for NoveltyPrioritizer {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveryBenchmark {
    pub baseline_unique_signatures: usize,
    pub prioritized_unique_signatures: usize,
}

impl DiscoveryBenchmark {
    pub fn improvement(&self) -> isize {
        self.prioritized_unique_signatures as isize - self.baseline_unique_signatures as isize
    }
}

/// Compares baseline queue-order discovery vs novelty-prioritized discovery.
pub fn benchmark_novelty_discovery(
    candidates: &[SeedNoveltyCandidate],
    budget: usize,
) -> DiscoveryBenchmark {
    let b = budget.min(candidates.len());

    let baseline_unique_signatures = candidates
        .iter()
        .take(b)
        .map(|c| c.signature_hash)
        .collect::<HashSet<_>>()
        .len();

    let mut prioritizer = NoveltyPrioritizer::new();
    let mut remaining: Vec<SeedNoveltyCandidate> = candidates.to_vec();
    let mut consumed = 0usize;

    while consumed < b && !remaining.is_empty() {
        let order = prioritizer.prioritize_indices(&remaining);
        let idx = order[0];
        let picked = remaining.swap_remove(idx);
        prioritizer.record_observation(picked.signature_hash, picked.state_diff_hash);
        consumed += 1;
    }

    DiscoveryBenchmark {
        baseline_unique_signatures,
        prioritized_unique_signatures: prioritizer.unique_signatures_seen(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(id: u64, sig: u64, diff: Option<u64>) -> SeedNoveltyCandidate {
        SeedNoveltyCandidate {
            seed: CaseSeed {
                id,
                payload: vec![id as u8],
            },
            signature_hash: sig,
            state_diff_hash: diff,
        }
    }

    #[test]
    fn prioritizer_prefers_unseen_signature() {
        let mut p = NoveltyPrioritizer::new();
        p.record_observation(10, Some(1));
        assert!(p.novelty_score(11, Some(1)) > p.novelty_score(10, Some(1)));
    }

    #[test]
    fn prioritizer_uses_state_diff_as_secondary_signal() {
        let mut p = NoveltyPrioritizer::new();
        p.record_observation(10, Some(1));
        assert!(p.novelty_score(10, Some(2)) > p.novelty_score(10, Some(1)));
    }

    #[test]
    fn benchmark_improves_unique_signature_discovery() {
        let candidates = vec![
            candidate(1, 100, Some(1)),
            candidate(2, 100, Some(2)),
            candidate(3, 100, Some(3)),
            candidate(4, 200, Some(4)),
            candidate(5, 300, Some(5)),
            candidate(6, 400, Some(6)),
        ];

        let result = benchmark_novelty_discovery(&candidates, 3);
        assert!(result.prioritized_unique_signatures >= result.baseline_unique_signatures);
        assert!(result.improvement() >= 1);
    }

    #[test]
    fn prioritize_indices_is_stable_under_ties_by_seed_id() {
        let p = NoveltyPrioritizer::new();
        let c = vec![
            candidate(3, 10, None),
            candidate(1, 11, None),
            candidate(2, 12, None),
        ];
        let idx = p.prioritize_indices(&c);
        let ordered_ids: Vec<u64> = idx.into_iter().map(|i| c[i].seed.id).collect();
        assert_eq!(ordered_ids, vec![1, 2, 3]);
    }
}
