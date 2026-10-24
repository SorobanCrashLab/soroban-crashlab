//! Stateful sequence fuzzing: multi-invocation call chains from one seed.
//!
//! Most serious contract bugs need *sequences* — initialize then exploit,
//! drain-then-refill, reentrancy across calls, state written by call N consumed
//! by call N+1 — but a plain [`CaseSeed`] is a single contract invocation, so
//! whole bug classes are unreachable.
//!
//! This module introduces a **seed schema v2** where a seed is an ordered list
//! of [`SequenceStep`]s. Step N is executed against the ledger state left by
//! step N-1 (see [`drive_sequence`]), each step records its own
//! [`StepExpectation`], and the aggregate outcome attributes the **first
//! divergence** to a specific step index ([`SequenceVerdict::Diverged`]).
//!
//! * **Schema** — [`SequenceSeed`] (`schema: 2`). v1 single-step bundles load as
//!   1-step sequences ([`SequenceSeed::from_bundle_document`],
//!   [`SequenceSeed::from_case_seed`]).
//! * **Length** — [`SequenceConfig`] bounds steps 1..=K, sampled deterministically
//!   from a [`crate::prng::SeededPrng`] stream.
//! * **Mutation** — per-step payload mutation plus structural insert/delete/swap
//!   that is state-aware (it never removes or reorders the state-bearing prefix).
//! * **Shrink** — [`shrink_sequence`] drops steps while the crash signature is
//!   preserved.

use crate::prng::SeededPrng;
use crate::{compute_signature_hash, AuthMode, CaseBundleDocument, CaseSeed, CrashSignature};
use serde::{Deserialize, Serialize};
use std::fmt;

/// Version of the sequence seed schema (`2` = ordered multi-step chains).
///
/// Schema `1` is the legacy single-invocation seed and is accepted on load
/// (it is migrated to a 1-step sequence).
pub const SEQUENCE_SCHEMA_VERSION: u32 = 2;

/// Sequence schema versions this build can load.
pub const SUPPORTED_SEQUENCE_SCHEMAS: &[u32] = &[1, SEQUENCE_SCHEMA_VERSION];

/// Default lower bound on chain length (inclusive).
pub const DEFAULT_SEQUENCE_MIN_STEPS: usize = 1;

/// Default upper bound `K` on chain length (inclusive).
pub const DEFAULT_SEQUENCE_MAX_STEPS: usize = 5;

/// Steps a campaign preset produces by default (issue default: 3–5).
pub const PRESET_SEQUENCE_MIN_STEPS: usize = 3;
pub const PRESET_SEQUENCE_MAX_STEPS: usize = 5;

/// Observed outcome of executing a single step.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StepOutcome {
    /// The invocation completed successfully.
    Success,
    /// The invocation failed with the given taxonomy category label.
    Failure { class: String },
}

impl StepOutcome {
    /// Stable label used in signature categories and scenario exports.
    pub fn label(&self) -> String {
        match self {
            StepOutcome::Success => "success".to_string(),
            StepOutcome::Failure { class } => class.clone(),
        }
    }
}

impl fmt::Display for StepOutcome {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.label())
    }
}

/// What a step is *expected* to produce. `Any` accepts either outcome.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StepExpectation {
    /// Step is expected to succeed.
    Success,
    /// Step is expected to fail with the given taxonomy category label.
    Failure { class: String },
    /// No expectation; either outcome is acceptable.
    Any,
}

impl fmt::Display for StepExpectation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StepExpectation::Success => write!(f, "success"),
            StepExpectation::Failure { class } => write!(f, "fails({class})"),
            StepExpectation::Any => write!(f, "any"),
        }
    }
}

/// One invocation in a call chain: payload + authorization mode + expectation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SequenceStep {
    /// Contract invocation payload for this step.
    pub invocation: Vec<u8>,
    /// Stable [`AuthMode`] label (`enforce`, `record`, `record_allow_nonroot`).
    ///
    /// Stored as a string so the step document stays self-describing and
    /// serde-friendly without coupling to [`AuthMode`]'s derives.
    pub auth_mode: String,
    /// Expected outcome for this step.
    pub expectation: StepExpectation,
}

impl SequenceStep {
    /// Builds a step from typed arguments, recording `auth_mode`'s stable label.
    pub fn new(invocation: Vec<u8>, auth_mode: AuthMode, expectation: StepExpectation) -> Self {
        Self {
            invocation,
            auth_mode: auth_mode.to_string(),
            expectation,
        }
    }

    /// Parses the recorded label back into an [`AuthMode`], if it is known.
    pub fn auth_mode(&self) -> Option<AuthMode> {
        match self.auth_mode.as_str() {
            "enforce" => Some(AuthMode::Enforce),
            "record" => Some(AuthMode::Record),
            "record_allow_nonroot" => Some(AuthMode::RecordAllowNonroot),
            _ => None,
        }
    }
}

/// A seed as an ordered chain of invocations (schema v2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SequenceSeed {
    pub schema: u32,
    pub id: u64,
    pub steps: Vec<SequenceStep>,
}

impl SequenceSeed {
    /// Builds a chain explicitly.
    pub fn new(id: u64, steps: Vec<SequenceStep>) -> Self {
        Self {
            schema: SEQUENCE_SCHEMA_VERSION,
            id,
            steps,
        }
    }

    /// A v1 single-invocation seed becomes a 1-step sequence with no expectation.
    pub fn from_case_seed(seed: &CaseSeed) -> Self {
        Self {
            schema: SEQUENCE_SCHEMA_VERSION,
            id: seed.id,
            steps: vec![SequenceStep::new(
                seed.payload.clone(),
                AuthMode::Enforce,
                StepExpectation::Any,
            )],
        }
    }

    /// A v1 single-step bundle document becomes a 1-step sequence whose step
    /// expects the failure the bundle recorded (W5-B06 migration).
    pub fn from_bundle_document(doc: &CaseBundleDocument) -> Self {
        Self {
            schema: SEQUENCE_SCHEMA_VERSION,
            id: doc.seed.id,
            steps: vec![SequenceStep::new(
                doc.seed.payload.clone(),
                AuthMode::Enforce,
                StepExpectation::Failure {
                    class: doc.signature.category.clone(),
                },
            )],
        }
    }

    /// True when the chain is exactly the legacy 1-step representation.
    pub fn is_single_step(&self) -> bool {
        self.steps.len() == 1
    }

    /// Serializes the seed to pretty JSON.
    pub fn to_json(&self) -> Result<Vec<u8>, SequenceError> {
        Ok(serde_json::to_vec_pretty(self)?)
    }

    /// Parses and schema-validates a seed from JSON bytes.
    pub fn from_json(bytes: &[u8]) -> Result<Self, SequenceError> {
        let seed: SequenceSeed = serde_json::from_slice(bytes)?;
        if !SUPPORTED_SEQUENCE_SCHEMAS.contains(&seed.schema) {
            return Err(SequenceError::UnsupportedSchema { found: seed.schema });
        }
        if seed.steps.is_empty() {
            return Err(SequenceError::NoSteps);
        }
        Ok(seed)
    }
}

/// Bounds on chain length: `min_steps..=max_steps`, where `max_steps` is the
/// configurable per-preset `K`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SequenceConfig {
    pub min_steps: usize,
    pub max_steps: usize,
}

impl Default for SequenceConfig {
    /// The campaign-preset default of 3–5 steps.
    fn default() -> Self {
        Self {
            min_steps: PRESET_SEQUENCE_MIN_STEPS,
            max_steps: PRESET_SEQUENCE_MAX_STEPS,
        }
    }
}

impl SequenceConfig {
    /// Builds a config, validating `1 <= min_steps <= max_steps`.
    pub fn new(min_steps: usize, max_steps: usize) -> Result<Self, SequenceError> {
        if min_steps == 0 || max_steps < min_steps {
            return Err(SequenceError::StepsOutOfRange {
                count: min_steps,
                min: 1,
                max: max_steps,
            });
        }
        Ok(Self {
            min_steps,
            max_steps,
        })
    }

    /// Any length from 1 up to `k`.
    pub fn bounded(k: usize) -> Result<Self, SequenceError> {
        Self::new(DEFAULT_SEQUENCE_MIN_STEPS, k)
    }

    /// A chain that is always exactly one step.
    pub fn single_step() -> Self {
        Self {
            min_steps: 1,
            max_steps: 1,
        }
    }

    /// Whether `steps` is within the configured bounds.
    pub fn allows(&self, steps: usize) -> bool {
        steps >= self.min_steps && steps <= self.max_steps
    }

    /// Samples a deterministic chain length from `rng` within `[min, max]`.
    pub fn sample_length(&self, rng: &mut SeededPrng) -> usize {
        rng.sequence_length(self.min_steps, self.max_steps)
    }
}

/// Aggregate result of evaluating a chain against observed step outcomes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SequenceVerdict {
    /// Every step matched its expectation.
    Matched,
    /// The first step whose observed outcome diverged from its expectation.
    Diverged {
        step_index: usize,
        expected: StepExpectation,
        observed: StepOutcome,
    },
    /// The chain did not execute to completion (length mismatch).
    Incomplete {
        expected_steps: usize,
        observed_steps: usize,
    },
}

impl SequenceVerdict {
    /// The index of the first divergent step, if any.
    pub fn divergence_step(&self) -> Option<usize> {
        match self {
            SequenceVerdict::Diverged { step_index, .. } => Some(*step_index),
            _ => None,
        }
    }

    /// Short, stable label used in scenario exports and reports.
    pub fn label(&self) -> String {
        match self {
            SequenceVerdict::Matched => "matched".to_string(),
            SequenceVerdict::Diverged { step_index, .. } => format!("diverged@{step_index}"),
            SequenceVerdict::Incomplete {
                expected_steps,
                observed_steps,
            } => format!("incomplete:{expected_steps}/{observed_steps}"),
        }
    }
}

/// Whether an observed outcome satisfies a step's expectation.
pub fn expectation_met(expected: &StepExpectation, observed: &StepOutcome) -> bool {
    match expected {
        StepExpectation::Any => true,
        StepExpectation::Success => matches!(observed, StepOutcome::Success),
        StepExpectation::Failure { class } => match observed {
            StepOutcome::Failure { class: actual } => actual == class,
            StepOutcome::Success => false,
        },
    }
}

/// Evaluates a fully-executed chain, attributing the **first** divergence to a
/// step index.
///
/// A length mismatch yields [`SequenceVerdict::Incomplete`] because no step
/// attribution is meaningful when the chain did not run to completion.
pub fn evaluate_sequence(steps: &[SequenceStep], observed: &[StepOutcome]) -> SequenceVerdict {
    if observed.len() != steps.len() {
        return SequenceVerdict::Incomplete {
            expected_steps: steps.len(),
            observed_steps: observed.len(),
        };
    }
    for (index, (step, outcome)) in steps.iter().zip(observed.iter()).enumerate() {
        if !expectation_met(&step.expectation, outcome) {
            return SequenceVerdict::Diverged {
                step_index: index,
                expected: step.expectation.clone(),
                observed: outcome.clone(),
            };
        }
    }
    SequenceVerdict::Matched
}

/// Executes one step against the ledger state carried forward from the previous
/// step, returning the observed outcome.
///
/// `ledger_state` starts empty and is whatever step N-1 left behind, which is
/// how stateful (initialise-then-exploit) chains are driven.
pub trait StepExecutor {
    fn execute(&mut self, step: &SequenceStep, ledger_state: &mut Vec<u8>) -> StepOutcome;
}

/// Result of executing a whole chain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SequenceRun {
    pub seed_id: u64,
    /// One outcome per step, in order.
    pub observations: Vec<StepOutcome>,
    /// Aggregate verdict with first-divergence attribution.
    pub verdict: SequenceVerdict,
}

/// Runs a chain, feeding each step the ledger state left by the previous step.
///
/// # Example
/// ```
/// use crashlab_core::sequence::{
///     drive_sequence, SequenceSeed, SequenceStep, StepExpectation, StepExecutor, StepOutcome,
/// };
/// use crashlab_core::{AuthMode, CaseSeed};
///
/// struct AlwaysSucceed;
/// impl StepExecutor for AlwaysSucceed {
///     fn execute(&mut self, _step: &SequenceStep, state: &mut Vec<u8>) -> StepOutcome {
///         state.push(1); // leave state for the next step
///         StepOutcome::Success
///     }
/// }
///
/// let seed = SequenceSeed::from_case_seed(&CaseSeed { id: 1, payload: vec![7] });
/// let run = drive_sequence(&seed, &mut AlwaysSucceed);
/// assert_eq!(run.observations, vec![StepOutcome::Success]);
/// # let _ = AuthMode::Enforce;
/// # let _ = StepExpectation::Any;
/// ```
pub fn drive_sequence<E: StepExecutor + ?Sized>(
    seed: &SequenceSeed,
    executor: &mut E,
) -> SequenceRun {
    let mut ledger_state: Vec<u8> = Vec::new();
    let mut observations = Vec::with_capacity(seed.steps.len());
    for step in &seed.steps {
        observations.push(executor.execute(step, &mut ledger_state));
    }
    let verdict = evaluate_sequence(&seed.steps, &observations);
    SequenceRun {
        seed_id: seed.id,
        observations,
        verdict,
    }
}

/// Crash signature for a chain given its observed outcomes.
///
/// It is derived from the **first divergent step** — the invocation that
/// actually produced the unexpected result — so redundant trailing steps can be
/// shrunk away without changing the signature.
pub fn sequence_crash_signature(
    steps: &[SequenceStep],
    observed: &[StepOutcome],
) -> CrashSignature {
    let verdict = evaluate_sequence(steps, observed);
    let (category, payload) = match &verdict {
        SequenceVerdict::Diverged {
            step_index,
            observed: outcome,
            ..
        } => {
            let payload = steps
                .get(*step_index)
                .map(|s| s.invocation.clone())
                .unwrap_or_default();
            (
                format!("sequence-diverge@{step_index}:{}", outcome.label()),
                payload,
            )
        }
        SequenceVerdict::Matched => (
            "sequence-matched".to_string(),
            steps
                .iter()
                .flat_map(|s| s.invocation.iter().copied())
                .collect::<Vec<u8>>(),
        ),
        SequenceVerdict::Incomplete {
            expected_steps,
            observed_steps,
        } => (
            format!("sequence-incomplete:{expected_steps}/{observed_steps}"),
            Vec::new(),
        ),
    };

    let digest = payload.iter().fold(0u64, |acc, b| {
        acc.wrapping_mul(1099511628211).wrapping_add(*b as u64)
    });

    CrashSignature {
        signature_hash: compute_signature_hash(&category, &payload),
        category,
        digest,
    }
}

/// A structural change to the shape of a chain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StructuralOp {
    /// Insert `step` after index `after` (`None` inserts at the front).
    Insert {
        after: Option<usize>,
        step: SequenceStep,
    },
    /// Remove the step at `index`.
    Delete { index: usize },
    /// Swap the steps at `a` and `b` (a reorder).
    Swap { a: usize, b: usize },
}

/// Applies a structural op while respecting chain bounds and state-awareness.
///
/// State-awareness: the first `state_prefix` steps are treated as the
/// state-bearing prefix (the initialisation that later steps consume), so they
/// are never deleted or moved.
pub fn apply_structural(
    seed: &SequenceSeed,
    op: &StructuralOp,
    config: &SequenceConfig,
    state_prefix: usize,
) -> Result<SequenceSeed, SequenceError> {
    let mut steps = seed.steps.clone();
    let prefix = state_prefix.min(steps.len());

    match op {
        StructuralOp::Insert { after, step } => {
            let at = match after {
                None => 0,
                Some(i) if *i < steps.len() => i + 1,
                _ => {
                    return Err(SequenceError::StepIndexOutOfBounds {
                        index: after.unwrap_or(0),
                        count: steps.len(),
                    })
                }
            };
            steps.insert(at, step.clone());
        }
        StructuralOp::Delete { index } => {
            if *index >= steps.len() {
                return Err(SequenceError::StepIndexOutOfBounds {
                    index: *index,
                    count: steps.len(),
                });
            }
            if *index < prefix {
                return Err(SequenceError::StatePrefixProtected {
                    index: *index,
                    prefix,
                });
            }
            steps.remove(*index);
        }
        StructuralOp::Swap { a, b } => {
            if *a >= steps.len() || *b >= steps.len() {
                return Err(SequenceError::StepIndexOutOfBounds {
                    index: (*a).max(*b),
                    count: steps.len(),
                });
            }
            if *a < prefix || *b < prefix {
                return Err(SequenceError::StatePrefixProtected {
                    index: (*a).min(*b),
                    prefix,
                });
            }
            steps.swap(*a, *b);
        }
    }

    if !config.allows(steps.len()) {
        return Err(SequenceError::StepsOutOfRange {
            count: steps.len(),
            min: config.min_steps,
            max: config.max_steps,
        });
    }

    Ok(SequenceSeed {
        schema: seed.schema,
        id: seed.id,
        steps,
    })
}

/// Picks a deterministic structural mutation from `rng` within bounds.
///
/// Returns the unmodified chain when no legal structural change is available.
pub fn structural_mutation(
    seed: &SequenceSeed,
    config: &SequenceConfig,
    state_prefix: usize,
    rng: &mut SeededPrng,
) -> SequenceSeed {
    let prefix = state_prefix.min(seed.steps.len());
    let movable: Vec<usize> = (prefix..seed.steps.len()).collect();
    if movable.is_empty() {
        return seed.clone();
    }

    let op = match rng.next_u64() % 3 {
        0 if config.max_steps > seed.steps.len() => {
            // Duplicate an existing movable step after itself.
            let src = movable[(rng.next_u64() as usize) % movable.len()];
            StructuralOp::Insert {
                after: Some(src),
                step: seed.steps[src].clone(),
            }
        }
        1 if seed.steps.len() > config.min_steps => {
            let idx = movable[(rng.next_u64() as usize) % movable.len()];
            StructuralOp::Delete { index: idx }
        }
        _ if movable.len() >= 2 => {
            let pick = (rng.next_u64() as usize) % movable.len();
            let a = movable[pick];
            let other = (rng.next_u64() as usize) % movable.len();
            let b = movable[other];
            StructuralOp::Swap { a, b }
        }
        _ => return seed.clone(),
    };

    apply_structural(seed, &op, config, state_prefix).unwrap_or_else(|_| seed.clone())
}

/// Mutates one step's payload, leaving the rest of the chain untouched.
///
/// This is the "mutate steps independently" half of step-level mutation.
pub fn mutate_step_payload(
    seed: &SequenceSeed,
    step_index: usize,
    new_payload: Vec<u8>,
) -> Result<SequenceSeed, SequenceError> {
    if step_index >= seed.steps.len() {
        return Err(SequenceError::StepIndexOutOfBounds {
            index: step_index,
            count: seed.steps.len(),
        });
    }
    let mut steps = seed.steps.clone();
    steps[step_index].invocation = new_payload;
    Ok(SequenceSeed {
        schema: seed.schema,
        id: seed.id,
        steps,
    })
}

/// Shrinks a chain by dropping steps while `signature_of` reports an unchanged
/// crash signature (W5-F03 for chains).
///
/// `min_steps` is the floor below which shrinking stops (it is clamped to at
/// least 1). Steps are considered from the tail forward, since a crash that is
/// already reproduced early does not need the steps that follow it.
pub fn shrink_sequence<F>(
    seed: &SequenceSeed,
    min_steps: usize,
    state_prefix: usize,
    signature_of: F,
) -> SequenceSeed
where
    F: Fn(&SequenceSeed) -> CrashSignature,
{
    let target = signature_of(seed);
    let floor = min_steps.max(1);
    let mut current = seed.clone();

    while current.steps.len() > floor {
        let prefix = state_prefix.min(current.steps.len());
        // Try removing from the tail backward, skipping the protected prefix.
        let mut dropped = false;
        let mut index = current.steps.len();
        while index > prefix {
            index -= 1;
            let op = StructuralOp::Delete { index };
            if let Ok(candidate) = apply_structural(
                &current,
                &op,
                &SequenceConfig::new(1, usize::MAX).unwrap(),
                state_prefix,
            ) {
                if signature_of(&candidate) == target {
                    current = candidate;
                    dropped = true;
                    break;
                }
            }
        }
        if !dropped {
            break;
        }
    }
    current
}

/// Per-step scenario row for export/replay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StepScenario {
    pub index: usize,
    /// Hex-encoded invocation payload.
    pub invocation: String,
    pub auth_mode: String,
    pub expectation: StepExpectation,
}

/// Exported, self-describing view of an executed chain.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SequenceScenario {
    pub schema: u32,
    pub seed_id: u64,
    pub steps: Vec<StepScenario>,
    pub observations: Vec<StepOutcome>,
    pub verdict: String,
    pub divergence_step: Option<usize>,
}

impl SequenceScenario {
    /// Builds an export view from a chain and its observed outcomes.
    pub fn new(seed: &SequenceSeed, observed: &[StepOutcome]) -> Self {
        let verdict = evaluate_sequence(&seed.steps, observed);
        Self {
            schema: seed.schema,
            seed_id: seed.id,
            steps: seed
                .steps
                .iter()
                .enumerate()
                .map(|(index, step)| StepScenario {
                    index,
                    invocation: hex::encode(&step.invocation),
                    auth_mode: step.auth_mode.clone(),
                    expectation: step.expectation.clone(),
                })
                .collect(),
            observations: observed.to_vec(),
            verdict: verdict.label(),
            divergence_step: verdict.divergence_step(),
        }
    }
}

/// Exports an executed chain as pretty JSON (replay-compatible).
pub fn export_sequence_json(
    seed: &SequenceSeed,
    observed: &[StepOutcome],
) -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(&SequenceScenario::new(seed, observed))
}

/// Rebuilds a [`SequenceSeed`] from an exported scenario (export/replay
/// round-trip). The execution outcomes are not part of the seed.
pub fn import_sequence_json(bytes: &[u8]) -> Result<SequenceSeed, SequenceError> {
    let scenario: SequenceScenario = serde_json::from_slice(bytes)?;
    let steps = scenario
        .steps
        .into_iter()
        .map(|row| SequenceStep {
            invocation: hex::decode(&row.invocation).unwrap_or_default(),
            auth_mode: row.auth_mode,
            expectation: row.expectation,
        })
        .collect();
    let seed = SequenceSeed {
        schema: if SUPPORTED_SEQUENCE_SCHEMAS.contains(&scenario.schema) {
            scenario.schema
        } else {
            scenario.schema
        },
        id: scenario.seed_id,
        steps,
    };
    if seed.steps.is_empty() {
        return Err(SequenceError::NoSteps);
    }
    Ok(seed)
}

/// Errors from sequence construction, parsing, or structural mutation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SequenceError {
    Json {
        message: String,
    },
    UnsupportedSchema {
        found: u32,
    },
    NoSteps,
    StepsOutOfRange {
        count: usize,
        min: usize,
        max: usize,
    },
    StepIndexOutOfBounds {
        index: usize,
        count: usize,
    },
    StatePrefixProtected {
        index: usize,
        prefix: usize,
    },
}

impl fmt::Display for SequenceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SequenceError::Json { message } => write!(f, "sequence JSON error: {message}"),
            SequenceError::UnsupportedSchema { found } => write!(
                f,
                "unsupported sequence schema {found} (supported: {SUPPORTED_SEQUENCE_SCHEMAS:?})"
            ),
            SequenceError::NoSteps => write!(f, "sequence seed has no steps"),
            SequenceError::StepsOutOfRange { count, min, max } => write!(
                f,
                "sequence has {count} steps; must be within {min}..={max}"
            ),
            SequenceError::StepIndexOutOfBounds { index, count } => {
                write!(f, "step index {index} out of bounds for {count} steps")
            }
            SequenceError::StatePrefixProtected { index, prefix } => write!(
                f,
                "step {index} is inside the state-bearing prefix of {prefix} step(s) and cannot be removed or reordered"
            ),
        }
    }
}

impl std::error::Error for SequenceError {}

impl From<serde_json::Error> for SequenceError {
    fn from(e: serde_json::Error) -> Self {
        SequenceError::Json {
            message: e.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(payload: &[u8], expectation: StepExpectation) -> SequenceStep {
        SequenceStep::new(payload.to_vec(), AuthMode::Enforce, expectation)
    }

    /// Fails when the invocation contains `0xFF`, otherwise succeeds. It appends
    /// the invocation to the ledger state so later steps can observe earlier ones.
    struct MarkingExecutor;

    impl StepExecutor for MarkingExecutor {
        fn execute(&mut self, s: &SequenceStep, state: &mut Vec<u8>) -> StepOutcome {
            if s.invocation.contains(&0xFF) {
                return StepOutcome::Failure {
                    class: "auth".to_string(),
                };
            }
            state.extend_from_slice(&s.invocation);
            StepOutcome::Success
        }
    }

    fn chain(payloads: &[&[u8]], expectation: StepExpectation) -> SequenceSeed {
        SequenceSeed::new(
            1,
            payloads
                .iter()
                .map(|p| step(p, expectation.clone()))
                .collect(),
        )
    }

    // ── schema & backward compatibility ───────────────────────────────────────

    #[test]
    fn v1_single_step_seed_loads_as_one_step_sequence() {
        let legacy = CaseSeed {
            id: 9,
            payload: vec![1, 2, 3],
        };
        let seq = SequenceSeed::from_case_seed(&legacy);
        assert_eq!(seq.schema, SEQUENCE_SCHEMA_VERSION);
        assert_eq!(seq.id, 9);
        assert!(seq.is_single_step());
        assert_eq!(seq.steps[0].invocation, vec![1, 2, 3]);
        assert_eq!(seq.steps[0].expectation, StepExpectation::Any);
    }

    #[test]
    fn v1_bundle_document_loads_as_one_step_with_expected_class() {
        let doc = CaseBundleDocument {
            schema: 1,
            engine_version: crate::engine_version::ENGINE_VERSION.to_string(),
            seed: CaseSeed {
                id: 3,
                payload: vec![0xA0],
            },
            signature: CrashSignature {
                category: "auth".to_string(),
                digest: 1,
                signature_hash: 2,
            },
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
            provenance: None,
            original_seed: None,
            shrink_lineage: None,
        };
        let seq = SequenceSeed::from_bundle_document(&doc);
        assert!(seq.is_single_step());
        assert_eq!(
            seq.steps[0].expectation,
            StepExpectation::Failure {
                class: "auth".to_string()
            }
        );
    }

    #[test]
    fn auth_mode_round_trips_through_label() {
        for mode in AuthMode::ALL {
            let s = SequenceStep::new(vec![1], mode, StepExpectation::Any);
            assert_eq!(s.auth_mode(), Some(mode));
            assert_eq!(s.auth_mode, mode.to_string());
        }
    }

    #[test]
    fn unsupported_schema_and_empty_steps_rejected() {
        let mut seed = SequenceSeed::new(1, vec![step(&[1], StepExpectation::Any)]);
        seed.schema = 99;
        let json = serde_json::to_vec(&seed).unwrap();
        match SequenceSeed::from_json(&json) {
            Err(SequenceError::UnsupportedSchema { found }) => assert_eq!(found, 99),
            other => panic!("expected UnsupportedSchema, got {other:?}"),
        }

        let empty = SequenceSeed {
            schema: SEQUENCE_SCHEMA_VERSION,
            id: 1,
            steps: vec![],
        };
        let json = serde_json::to_vec(&empty).unwrap();
        assert!(matches!(
            SequenceSeed::from_json(&json),
            Err(SequenceError::NoSteps)
        ));
    }

    // ── chain execution & state carry ─────────────────────────────────────────

    #[test]
    fn chain_execution_carries_ledger_state_across_steps() {
        // Step N appends to the state; step N+1 asserts it saw step N's bytes.
        struct Recorder {
            seen: Vec<Vec<u8>>,
        }
        impl StepExecutor for Recorder {
            fn execute(&mut self, s: &SequenceStep, state: &mut Vec<u8>) -> StepOutcome {
                self.seen.push(state.clone());
                state.extend_from_slice(&s.invocation);
                StepOutcome::Success
            }
        }
        let seed = chain(&[&[1], &[2], &[3]], StepExpectation::Any);
        let mut rec = Recorder { seen: Vec::new() };
        let _run = drive_sequence(&seed, &mut rec);
        assert_eq!(rec.seen[0], Vec::<u8>::new(), "first step starts empty");
        assert_eq!(rec.seen[1], vec![1], "second step sees first step's state");
        assert_eq!(rec.seen[2], vec![1, 2], "third step sees both prior steps");
    }

    #[test]
    fn fully_matching_chain_reports_matched() {
        let seed = chain(&[&[1], &[2]], StepExpectation::Any);
        let run = drive_sequence(&seed, &mut MarkingExecutor);
        assert_eq!(run.verdict, SequenceVerdict::Matched);
        assert_eq!(run.verdict.divergence_step(), None);
    }

    // ── divergence attribution ────────────────────────────────────────────────

    #[test]
    fn first_divergence_is_attributed_to_its_step_index() {
        // Steps 0 and 1 expected to succeed; step 2 carries 0xFF -> auth failure.
        let seed = SequenceSeed::new(
            7,
            vec![
                step(&[1], StepExpectation::Success),
                step(&[2], StepExpectation::Success),
                step(&[0xFF, 3], StepExpectation::Success),
            ],
        );
        let run = drive_sequence(&seed, &mut MarkingExecutor);
        match &run.verdict {
            SequenceVerdict::Diverged {
                step_index,
                expected,
                observed,
            } => {
                assert_eq!(*step_index, 2);
                assert_eq!(expected, &StepExpectation::Success);
                assert_eq!(
                    observed,
                    &StepOutcome::Failure {
                        class: "auth".to_string()
                    }
                );
            }
            other => panic!("expected Diverged, got {other:?}"),
        }
        assert_eq!(run.verdict.label(), "diverged@2");
    }

    #[test]
    fn per_step_expected_classes_drive_evaluation() {
        let seed = SequenceSeed::new(
            4,
            vec![
                step(
                    &[0xFF],
                    StepExpectation::Failure {
                        class: "auth".to_string(),
                    },
                ),
                step(&[2], StepExpectation::Success),
            ],
        );
        let run = drive_sequence(&seed, &mut MarkingExecutor);
        assert_eq!(run.verdict, SequenceVerdict::Matched);
    }

    #[test]
    fn mismatched_class_diverges_at_its_step() {
        let seed = SequenceSeed::new(
            5,
            vec![step(
                &[0xFF],
                StepExpectation::Failure {
                    class: "state".to_string(),
                },
            )],
        );
        let run = drive_sequence(&seed, &mut MarkingExecutor);
        assert_eq!(run.verdict.divergence_step(), Some(0));
    }

    #[test]
    fn length_mismatch_reports_incomplete() {
        let steps = vec![
            step(&[1], StepExpectation::Any),
            step(&[2], StepExpectation::Any),
        ];
        let observed = vec![StepOutcome::Success];
        let verdict = evaluate_sequence(&steps, &observed);
        assert_eq!(
            verdict,
            SequenceVerdict::Incomplete {
                expected_steps: 2,
                observed_steps: 1
            }
        );
    }

    #[test]
    fn any_expectation_accepts_both_outcomes() {
        assert!(expectation_met(
            &StepExpectation::Any,
            &StepOutcome::Success
        ));
        assert!(expectation_met(
            &StepExpectation::Any,
            &StepOutcome::Failure { class: "x".into() }
        ));
    }

    // ── signature ─────────────────────────────────────────────────────────────

    #[test]
    fn crash_signature_comes_from_divergent_step_payload() {
        let seed = SequenceSeed::new(
            8,
            vec![
                step(&[1], StepExpectation::Success),
                step(&[0xFF], StepExpectation::Success),
                step(&[9], StepExpectation::Success),
            ],
        );
        let mut out = Vec::new();
        for s in &seed.steps {
            out.push(if s.invocation.contains(&0xFF) {
                StepOutcome::Failure {
                    class: "auth".into(),
                }
            } else {
                StepOutcome::Success
            });
        }
        let sig = sequence_crash_signature(&seed.steps, &out);
        assert!(sig.category.contains("sequence-diverge@1:auth"));
        // The hash is derived from the divergent step's payload only.
        assert_eq!(
            sig.signature_hash,
            compute_signature_hash(&sig.category, &[0xFF])
        );
    }

    // ── mutation ──────────────────────────────────────────────────────────────

    #[test]
    fn mutate_step_payload_changes_only_that_step() {
        let seed = chain(&[&[1], &[2], &[3]], StepExpectation::Any);
        let mutated = mutate_step_payload(&seed, 1, vec![9, 9]).unwrap();
        assert_eq!(mutated.steps[0].invocation, vec![1]);
        assert_eq!(mutated.steps[1].invocation, vec![9, 9]);
        assert_eq!(mutated.steps[2].invocation, vec![3]);
        assert_eq!(mutated.steps.len(), 3);
        assert!(mutate_step_payload(&seed, 3, vec![]).is_err());
    }

    #[test]
    fn structural_insert_delete_and_swap_respect_bounds() {
        let config = SequenceConfig::new(2, 4).unwrap();
        let seed = chain(&[&[1], &[2], &[3]], StepExpectation::Any);

        let inserted = apply_structural(
            &seed,
            &StructuralOp::Insert {
                after: Some(0),
                step: step(&[4], StepExpectation::Any),
            },
            &config,
            1,
        )
        .unwrap();
        assert_eq!(inserted.steps.len(), 4);
        assert_eq!(inserted.steps[1].invocation, vec![4]);

        // Exceeding max_steps is rejected.
        let too_many = chain(&[&[1], &[2], &[3], &[4]], StepExpectation::Any);
        assert!(matches!(
            apply_structural(
                &too_many,
                &StructuralOp::Insert {
                    after: Some(3),
                    step: step(&[5], StepExpectation::Any)
                },
                &config,
                1
            ),
            Err(SequenceError::StepsOutOfRange { .. })
        ));

        // Dropping below min_steps is rejected.
        let min2 = SequenceConfig::new(2, 5).unwrap();
        let two = chain(&[&[1], &[2]], StepExpectation::Any);
        assert!(matches!(
            apply_structural(&two, &StructuralOp::Delete { index: 1 }, &min2, 1),
            Err(SequenceError::StepsOutOfRange { .. })
        ));

        // Swap reorders.
        let swapped =
            apply_structural(&seed, &StructuralOp::Swap { a: 1, b: 2 }, &config, 1).unwrap();
        assert_eq!(swapped.steps[1].invocation, vec![3]);
        assert_eq!(swapped.steps[2].invocation, vec![2]);
    }

    #[test]
    fn state_prefix_is_protected_from_delete_and_swap() {
        let config = SequenceConfig::new(1, 5).unwrap();
        let seed = chain(&[&[1], &[2], &[3]], StepExpectation::Any);
        assert!(matches!(
            apply_structural(&seed, &StructuralOp::Delete { index: 0 }, &config, 1),
            Err(SequenceError::StatePrefixProtected { .. })
        ));
        assert!(matches!(
            apply_structural(&seed, &StructuralOp::Swap { a: 0, b: 2 }, &config, 1),
            Err(SequenceError::StatePrefixProtected { .. })
        ));
        // Deleting a non-prefix step is fine.
        assert!(apply_structural(&seed, &StructuralOp::Delete { index: 2 }, &config, 1).is_ok());
    }

    #[test]
    fn structural_mutation_is_deterministic_for_same_rng() {
        let config = SequenceConfig::new(1, 5).unwrap();
        let seed = chain(&[&[1], &[2], &[3]], StepExpectation::Any);
        let a = structural_mutation(&seed, &config, 1, &mut SeededPrng::new(11));
        let b = structural_mutation(&seed, &config, 1, &mut SeededPrng::new(11));
        assert_eq!(a, b);
        assert!(config.allows(a.steps.len()));
    }

    // ── length stream ─────────────────────────────────────────────────────────

    #[test]
    fn sampled_lengths_stay_within_config_bounds() {
        let config = SequenceConfig::new(3, 5).unwrap();
        let mut rng = SeededPrng::new(42);
        for _ in 0..200 {
            let len = config.sample_length(&mut rng);
            assert!(len >= 3 && len <= 5, "out of bounds: {len}");
        }
    }

    #[test]
    fn sequence_length_is_deterministic_and_spans_range() {
        let a = {
            let mut r = SeededPrng::new(5);
            (0..200)
                .map(|_| r.sequence_length(3, 5))
                .collect::<Vec<_>>()
        };
        let b = {
            let mut r = SeededPrng::new(5);
            (0..200)
                .map(|_| r.sequence_length(3, 5))
                .collect::<Vec<_>>()
        };
        assert_eq!(a, b);
        let distinct: std::collections::BTreeSet<_> = a.iter().copied().collect();
        assert!(distinct.len() >= 2, "expected more than one sampled length");
    }

    #[test]
    fn config_validation_rejects_bad_bounds() {
        assert!(SequenceConfig::new(0, 3).is_err());
        assert!(SequenceConfig::new(5, 3).is_err());
        assert!(SequenceConfig::new(3, 5).is_ok());
        assert!(SequenceConfig::bounded(0).is_err());
    }

    // ── shrink ────────────────────────────────────────────────────────────────

    #[test]
    fn shrink_drops_steps_while_signature_preserved() {
        // Divergence happens at step 0 (0xFF); the following steps are redundant.
        let seed = SequenceSeed::new(
            1,
            vec![
                step(&[0xFF], StepExpectation::Success),
                step(&[2], StepExpectation::Success),
                step(&[3], StepExpectation::Success),
                step(&[4], StepExpectation::Success),
            ],
        );

        let signature_of = |s: &SequenceSeed| {
            let observed: Vec<StepOutcome> = s
                .steps
                .iter()
                .map(|st| {
                    if st.invocation.contains(&0xFF) {
                        StepOutcome::Failure {
                            class: "auth".to_string(),
                        }
                    } else {
                        StepOutcome::Success
                    }
                })
                .collect();
            sequence_crash_signature(&s.steps, &observed)
        };

        let original_sig = signature_of(&seed);
        let shrunk = shrink_sequence(&seed, 1, 1, &signature_of);

        // The divergent first step (the state-bearing prefix) is retained.
        assert_eq!(shrunk.steps[0].invocation, vec![0xFF]);
        assert!(shrunk.steps.len() < seed.steps.len());
        assert_eq!(signature_of(&shrunk), original_sig, "signature preserved");
        assert_eq!(shrunk.id, seed.id);
    }

    #[test]
    fn shrink_stops_at_min_steps() {
        let seed = chain(&[&[1], &[2], &[3]], StepExpectation::Any);
        let signature_of = |_s: &SequenceSeed| CrashSignature {
            category: "same".to_string(),
            digest: 0,
            signature_hash: 0,
        };
        let shrunk = shrink_sequence(&seed, 2, 1, &signature_of);
        assert_eq!(shrunk.steps.len(), 2, "stopped at min_steps");
    }

    // ── export / replay round-trip ────────────────────────────────────────────

    #[test]
    fn seed_json_round_trips() {
        let seed = SequenceSeed::new(
            6,
            vec![
                step(&[1, 2], StepExpectation::Success),
                step(
                    &[3],
                    StepExpectation::Failure {
                        class: "auth".into(),
                    },
                ),
            ],
        );
        let json = seed.to_json().unwrap();
        let back = SequenceSeed::from_json(&json).unwrap();
        assert_eq!(seed, back);
    }

    #[test]
    fn scenario_export_replays_back_to_same_seed() {
        let seed = chain(&[&[1], &[0xFF], &[3]], StepExpectation::Success);
        let observed = vec![
            StepOutcome::Success,
            StepOutcome::Failure {
                class: "auth".to_string(),
            },
            StepOutcome::Success,
        ];

        let json = export_sequence_json(&seed, &observed).unwrap();
        let scenario: SequenceScenario = serde_json::from_str(&json).unwrap();
        assert_eq!(scenario.verdict, "diverged@1");
        assert_eq!(scenario.divergence_step, Some(1));
        assert_eq!(scenario.steps.len(), 3);
        assert_eq!(scenario.steps[1].invocation, "ff");

        let replayed = import_sequence_json(json.as_bytes()).unwrap();
        assert_eq!(replayed.steps, seed.steps);
        assert_eq!(replayed.id, seed.id);
        // Re-evaluating the replayed seed reproduces the same verdict.
        assert_eq!(
            evaluate_sequence(&replayed.steps, &observed).label(),
            "diverged@1"
        );
    }

    // ── JSON error surface ────────────────────────────────────────────────────

    #[test]
    fn malformed_json_reports_sequence_error() {
        let err = SequenceSeed::from_json(b"not json").unwrap_err();
        assert!(matches!(err, SequenceError::Json { .. }));
    }
}
