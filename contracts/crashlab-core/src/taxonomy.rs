use crate::is_invalid_enum_tag_payload;
use crate::CaseSeed;
use std::collections::HashMap;

/// Stable failure categories for Soroban contract crashes.
///
/// ## Category descriptions
///
/// | Variant          | Failure domain                                              |
/// |------------------|-------------------------------------------------------------|
/// | `Auth`           | Missing or invalid authorization entry                      |
/// | `Budget`         | CPU or memory execution budget exceeded                     |
/// | `State`          | Ledger entry absent, wrong type, or version conflict        |
/// | `Xdr`            | XDR encoding / decoding error — malformed or out-of-range  |
/// | `InvalidEnumTag` | Enum-like payload carried an unsupported discriminant tag   |
/// | `EmptyInput`     | Seed payload was empty; no execution was attempted          |
/// | `OversizedInput` | Seed payload exceeded the maximum allowable size            |
/// | `Unknown`        | Raw failure did not match any known category                |
///
/// Classifications produced by [`classify_failure`] are deterministic:
/// the same seed always maps to the same `FailureClass`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FailureClass {
    /// Authorization check failed: missing or invalid auth entry.
    Auth,
    /// Execution budget exceeded: CPU or memory limit hit.
    Budget,
    /// Ledger state error: missing entry, type mismatch, or version conflict.
    State,
    /// XDR encoding or decoding error: malformed or out-of-range value.
    Xdr,
    /// Enum discriminant tag is outside supported variant set.
    InvalidEnumTag,
    /// Seed payload was empty; no execution attempted.
    EmptyInput,
    /// Seed payload exceeded the maximum allowable size (> 64 bytes).
    OversizedInput,
    /// Raw failure did not match any known category.
    Unknown,
}

impl FailureClass {
    /// Stable string label used in signatures, reports, and dashboards.
    ///
    /// The returned string is guaranteed never to change across crate versions,
    /// making it safe to persist in artifact storage or use as a map key.
    pub fn as_str(self) -> &'static str {
        match self {
            FailureClass::Auth => "auth",
            FailureClass::Budget => "budget",
            FailureClass::State => "state",
            FailureClass::Xdr => "xdr",
            FailureClass::InvalidEnumTag => "invalid-enum-tag",
            FailureClass::EmptyInput => "empty-input",
            FailureClass::OversizedInput => "oversized-input",
            FailureClass::Unknown => "unknown",
        }
    }

    /// All variants in declaration order, useful for iteration and reporting.
    pub const ALL: [FailureClass; 8] = [
        FailureClass::Auth,
        FailureClass::Budget,
        FailureClass::State,
        FailureClass::Xdr,
        FailureClass::InvalidEnumTag,
        FailureClass::EmptyInput,
        FailureClass::OversizedInput,
        FailureClass::Unknown,
    ];
}

impl std::fmt::Display for FailureClass {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Classifies a seed into a stable [`FailureClass`] based on its payload.
///
/// ## Classification rules (applied in priority order)
///
/// 1. **EmptyInput** — `payload` is empty.
/// 2. **OversizedInput** — `payload.len() > 64`.
/// 3. **Byte discriminant** derived from `payload[0]`:
///
///    | Range          | Class    | Rationale                                       |
///    |----------------|----------|-------------------------------------------------|
///    | `0x00..=0x1F`  | `Xdr`    | Null / low-value bytes indicate XDR decode fail |
///    | `0x20..=0x5F`  | `State`  | Mid-low range maps to ledger state operations   |
///    | `0x60..=0x9F`  | `Budget` | Mid-high range maps to computation-heavy paths  |
///    | `0xA0..=0xFF`  | `Auth`   | High-value bytes map to auth context failures   |
///
/// The classification is purely deterministic — no randomness, no I/O.
///
/// # Example
///
/// ```rust
/// use crashlab_core::CaseSeed;
/// use crashlab_core::taxonomy::{classify_failure, FailureClass};
///
/// let empty = CaseSeed { id: 1, payload: vec![] };
/// assert_eq!(classify_failure(&empty), FailureClass::EmptyInput);
///
/// let auth = CaseSeed { id: 2, payload: vec![0xA0, 0x01] };
/// assert_eq!(classify_failure(&auth), FailureClass::Auth);
/// ```
pub fn classify_failure(seed: &CaseSeed) -> FailureClass {
    if seed.payload.is_empty() {
        return FailureClass::EmptyInput;
    }
    if seed.payload.len() > 64 {
        return FailureClass::OversizedInput;
    }
    if is_invalid_enum_tag_payload(&seed.payload) {
        return FailureClass::InvalidEnumTag;
    }
    match seed.payload[0] {
        0x00..=0x1F => FailureClass::Xdr,
        0x20..=0x5F => FailureClass::State,
        0x60..=0x9F => FailureClass::Budget,
        0xA0..=0xFF => FailureClass::Auth,
    }
}

/// Groups `seeds` by their [`FailureClass`], returning a map from class to
/// the seeds that belong to it.
///
/// Seeds that share a class are collected in input order.  Classes with no
/// matching seeds are absent from the returned map — iterate [`FailureClass::ALL`]
/// if you need a complete, zero-padded breakdown.
///
/// # Example
///
/// ```rust
/// use crashlab_core::CaseSeed;
/// use crashlab_core::taxonomy::{group_by_class, FailureClass};
///
/// let seeds = vec![
///     CaseSeed { id: 1, payload: vec![] },           // EmptyInput
///     CaseSeed { id: 2, payload: vec![0xA0] },        // Auth
///     CaseSeed { id: 3, payload: vec![0xB0, 0x01] },  // Auth
/// ];
///
/// let groups = group_by_class(&seeds);
/// assert_eq!(groups[&FailureClass::Auth].len(), 2);
/// assert_eq!(groups[&FailureClass::EmptyInput].len(), 1);
/// ```
pub fn group_by_class(seeds: &[CaseSeed]) -> HashMap<FailureClass, Vec<&CaseSeed>> {
    let mut map: HashMap<FailureClass, Vec<&CaseSeed>> = HashMap::new();
    for seed in seeds {
        map.entry(classify_failure(seed)).or_default().push(seed);
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::CaseSeed;

    fn seed(payload: Vec<u8>) -> CaseSeed {
        CaseSeed { id: 0, payload }
    }

    // ── classify_failure: structural rules ───────────────────────────────────

    #[test]
    fn empty_payload_is_empty_input() {
        assert_eq!(classify_failure(&seed(vec![])), FailureClass::EmptyInput);
    }

    #[test]
    fn payload_of_65_bytes_is_oversized() {
        assert_eq!(
            classify_failure(&seed(vec![0x00; 65])),
            FailureClass::OversizedInput
        );
    }

    #[test]
    fn payload_of_exactly_64_bytes_uses_byte_discriminant() {
        // 64-byte payload with first byte 0xA0 → Auth, not OversizedInput
        let p: Vec<u8> = std::iter::once(0xA0).chain(vec![0x01; 63]).collect();
        assert_eq!(classify_failure(&seed(p)), FailureClass::Auth);
    }

    // ── classify_failure: byte discriminant boundaries ───────────────────────

    #[test]
    fn first_byte_0x00_is_xdr() {
        assert_eq!(classify_failure(&seed(vec![0x00])), FailureClass::Xdr);
    }

    #[test]
    fn first_byte_0x1f_is_xdr() {
        assert_eq!(classify_failure(&seed(vec![0x1F])), FailureClass::Xdr);
    }

    #[test]
    fn first_byte_0x20_is_state() {
        assert_eq!(classify_failure(&seed(vec![0x20])), FailureClass::State);
    }

    #[test]
    fn first_byte_0x5f_is_state() {
        assert_eq!(classify_failure(&seed(vec![0x5F])), FailureClass::State);
    }

    #[test]
    fn first_byte_0x60_is_budget() {
        assert_eq!(classify_failure(&seed(vec![0x60])), FailureClass::Budget);
    }

    #[test]
    fn first_byte_0x9f_is_budget() {
        assert_eq!(classify_failure(&seed(vec![0x9F])), FailureClass::Budget);
    }

    #[test]
    fn first_byte_0xa0_is_auth() {
        assert_eq!(classify_failure(&seed(vec![0xA0])), FailureClass::Auth);
    }

    #[test]
    fn first_byte_0xff_is_auth() {
        assert_eq!(classify_failure(&seed(vec![0xFF])), FailureClass::Auth);
    }

    // ── classify_failure: classification is stable across calls ──────────────

    #[test]
    fn same_seed_always_maps_to_same_class() {
        let s = seed(vec![0x70, 0x01, 0x02]);
        assert_eq!(classify_failure(&s), classify_failure(&s));
    }

    // ── FailureClass::as_str ─────────────────────────────────────────────────

    #[test]
    fn as_str_returns_stable_labels() {
        assert_eq!(FailureClass::Auth.as_str(), "auth");
        assert_eq!(FailureClass::Budget.as_str(), "budget");
        assert_eq!(FailureClass::State.as_str(), "state");
        assert_eq!(FailureClass::Xdr.as_str(), "xdr");
        assert_eq!(FailureClass::InvalidEnumTag.as_str(), "invalid-enum-tag");
        assert_eq!(FailureClass::EmptyInput.as_str(), "empty-input");
        assert_eq!(FailureClass::OversizedInput.as_str(), "oversized-input");
        assert_eq!(FailureClass::Unknown.as_str(), "unknown");
    }

    #[test]
    fn display_matches_as_str() {
        for class in FailureClass::ALL {
            assert_eq!(class.to_string(), class.as_str());
        }
    }

    #[test]
    fn all_contains_seven_variants() {
        assert_eq!(FailureClass::ALL.len(), 8);
    }

    #[test]
    fn invalid_enum_tag_is_classified_distinctly() {
        let seed = CaseSeed {
            id: 0,
            payload: vec![0xE0, 0xFF],
        };
        assert_eq!(classify_failure(&seed), FailureClass::InvalidEnumTag);
    }

    // ── group_by_class ───────────────────────────────────────────────────────

    #[test]
    fn groups_seeds_into_correct_classes() {
        let seeds = vec![
            seed(vec![]),     // EmptyInput
            seed(vec![0xA0]), // Auth
            seed(vec![0xB5]), // Auth
            seed(vec![0x10]), // Xdr
            seed(vec![0x30]), // State
            seed(vec![0x70]), // Budget
        ];
        let groups = group_by_class(&seeds);

        assert_eq!(groups[&FailureClass::EmptyInput].len(), 1);
        assert_eq!(groups[&FailureClass::Auth].len(), 2);
        assert_eq!(groups[&FailureClass::Xdr].len(), 1);
        assert_eq!(groups[&FailureClass::State].len(), 1);
        assert_eq!(groups[&FailureClass::Budget].len(), 1);
    }

    #[test]
    fn absent_classes_not_in_map() {
        let seeds = vec![seed(vec![0xA0])]; // Auth only
        let groups = group_by_class(&seeds);

        assert!(groups.contains_key(&FailureClass::Auth));
        assert!(!groups.contains_key(&FailureClass::EmptyInput));
        assert!(!groups.contains_key(&FailureClass::Budget));
    }

    #[test]
    fn empty_input_returns_empty_map() {
        let groups = group_by_class(&[]);
        assert!(groups.is_empty());
    }

    #[test]
    fn group_preserves_seed_order_within_class() {
        let s1 = CaseSeed {
            id: 1,
            payload: vec![0xA1],
        };
        let s2 = CaseSeed {
            id: 2,
            payload: vec![0xA2],
        };
        let s3 = CaseSeed {
            id: 3,
            payload: vec![0xA3],
        };
        let seeds = vec![s1.clone(), s2.clone(), s3.clone()];

        let groups = group_by_class(&seeds);
        let auth = &groups[&FailureClass::Auth];

        assert_eq!(auth[0].id, 1);
        assert_eq!(auth[1].id, 2);
        assert_eq!(auth[2].id, 3);
    }

    #[test]
    fn oversized_seeds_grouped_separately_from_byte_classes() {
        let oversized = seed(vec![0xA0; 65]); // would be Auth if not oversized
        let normal_auth = seed(vec![0xA0]);

        let seeds = vec![oversized, normal_auth];
        let groups = group_by_class(&seeds);

        assert_eq!(groups[&FailureClass::OversizedInput].len(), 1);
        assert_eq!(groups[&FailureClass::Auth].len(), 1);
    }
}
