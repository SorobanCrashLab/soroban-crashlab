//! Stable crash signature hashing from category stacks and key fields.
//!
//! [`SignatureHasher`] accumulates a "category stack" (an ordered sequence of
//! failure categories, e.g. `["auth", "missing-entry"]`) plus arbitrary key
//! fields (e.g. `{"contract": "transfer", "auth_mode": "enforce"}`), then
//! produces a deterministic FNV-1a 64-bit hash.
//!
//! Two equivalent failures — those that share the same category stack and key
//! fields — always produce the identical hash, regardless of which seed or run
//! produced them. This makes the hash safe to use as a dedup key in crash
//! indexes, regression suites, and triage dashboards.
//!
//! # Example
//!
//! ```rust
//! use crashlab_core::signature_hash::SignatureHasher;
//!
//! let mut h1 = SignatureHasher::new();
//! h1.push_category("auth");
//! h1.push_category("missing-entry");
//! h1.add_field("contract", "transfer");
//! h1.add_field("auth_mode", "enforce");
//!
//! let mut h2 = SignatureHasher::new();
//! h2.push_category("auth");
//! h2.push_category("missing-entry");
//! h2.add_field("contract", "transfer");
//! h2.add_field("auth_mode", "enforce");
//!
//! // Equivalent failures → identical hash.
//! assert_eq!(h1.finish(), h2.finish());
//! ```

use std::collections::BTreeMap;

/// FNV-1a 64-bit offset basis.
const FNV_OFFSET: u64 = 14695981039346656037;
/// FNV-1a 64-bit prime.
const FNV_PRIME: u64 = 1099511628211;

/// Separator byte injected between fields to prevent hash collisions caused by
/// adjacent values being concatenated without a delimiter.
///
/// Using a byte outside the ASCII printable range (0x1E = "Record Separator")
/// makes it unlikely to appear in category labels or field values.
const FIELD_SEP: u8 = 0x1E;

/// Accumulates a category stack and key fields, then derives a stable hash.
///
/// Call [`push_category`](Self::push_category) for each level of the failure
/// stack (outermost first), and [`add_field`](Self::add_field) for any
/// additional discriminating key–value pairs. Finally, call
/// [`finish`](Self::finish) to obtain the hash.
///
/// The hasher is designed for determinism: key fields are sorted by key name
/// before hashing so insertion order does not affect the result.
#[derive(Debug, Clone, Default)]
pub struct SignatureHasher {
    /// Ordered sequence of failure category labels (outermost → innermost).
    category_stack: Vec<String>,
    /// Sorted key–value fields that further discriminate the failure.
    fields: BTreeMap<String, String>,
}

impl SignatureHasher {
    /// Creates an empty hasher.
    pub fn new() -> Self {
        Self::default()
    }

    /// Appends `category` to the category stack.
    ///
    /// Order matters: `push_category("auth")` then `push_category("missing-entry")`
    /// produces a different hash than the reverse order.
    pub fn push_category(&mut self, category: impl Into<String>) -> &mut Self {
        self.category_stack.push(category.into());
        self
    }

    /// Inserts a key–value field.
    ///
    /// Fields are hashed in sorted key order regardless of insertion order, so
    /// `add_field("a", "1"); add_field("b", "2")` is equivalent to
    /// `add_field("b", "2"); add_field("a", "1")`.
    ///
    /// If the same key is added twice the later value overwrites the earlier one.
    pub fn add_field(&mut self, key: impl Into<String>, value: impl Into<String>) -> &mut Self {
        self.fields.insert(key.into(), value.into());
        self
    }

    /// Computes and returns the stable FNV-1a 64-bit hash.
    ///
    /// The hash is derived from:
    /// 1. The category stack entries, each separated by [`FIELD_SEP`].
    /// 2. A [`FIELD_SEP`] delimiter between the stack and the fields section.
    /// 3. Each key–value pair (key `FIELD_SEP` value), separated by [`FIELD_SEP`],
    ///    iterated in ascending key order.
    ///
    /// Calling `finish` does not consume the hasher; it can be called multiple
    /// times and will always return the same value.
    pub fn finish(&self) -> u64 {
        let mut hash = FNV_OFFSET;

        // Hash the category stack (order-sensitive).
        for (i, cat) in self.category_stack.iter().enumerate() {
            if i > 0 {
                hash = fnv1a_byte(hash, FIELD_SEP);
            }
            for byte in cat.as_bytes() {
                hash = fnv1a_byte(hash, *byte);
            }
        }

        // Separator between stack and fields.
        hash = fnv1a_byte(hash, FIELD_SEP);

        // Hash key–value fields in sorted key order (BTreeMap guarantees this).
        let mut first = true;
        for (key, value) in &self.fields {
            if !first {
                hash = fnv1a_byte(hash, FIELD_SEP);
            }
            first = false;
            for byte in key.as_bytes() {
                hash = fnv1a_byte(hash, *byte);
            }
            hash = fnv1a_byte(hash, FIELD_SEP);
            for byte in value.as_bytes() {
                hash = fnv1a_byte(hash, *byte);
            }
        }

        hash
    }
}

/// Mixes one byte into a running FNV-1a hash.
#[inline(always)]
fn fnv1a_byte(hash: u64, byte: u8) -> u64 {
    (hash ^ byte as u64).wrapping_mul(FNV_PRIME)
}

/// Convenience function: hash a single category label together with a raw
/// payload slice, matching the contract used by [`crate::compute_signature_hash`].
///
/// Prefer [`SignatureHasher`] when you need category stacks or key fields.
///
/// # Example
///
/// ```rust
/// use crashlab_core::signature_hash::hash_category_payload;
///
/// let h1 = hash_category_payload("auth", b"some payload");
/// let h2 = hash_category_payload("auth", b"some payload");
/// assert_eq!(h1, h2);
/// ```
pub fn hash_category_payload(category: &str, payload: &[u8]) -> u64 {
    let mut hasher = SignatureHasher::new();
    hasher.push_category(category);
    hasher.add_field("__payload__", &hex::encode(payload));
    hasher.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Core determinism ───────────────────────────────────────────────────────

    #[test]
    fn identical_inputs_produce_identical_hash() {
        let mut h1 = SignatureHasher::new();
        h1.push_category("auth");
        h1.push_category("missing-entry");
        h1.add_field("contract", "transfer");

        let mut h2 = SignatureHasher::new();
        h2.push_category("auth");
        h2.push_category("missing-entry");
        h2.add_field("contract", "transfer");

        assert_eq!(h1.finish(), h2.finish());
    }

    #[test]
    fn finish_is_idempotent() {
        let mut h = SignatureHasher::new();
        h.push_category("budget");
        h.add_field("limit", "cpu");

        let first = h.finish();
        let second = h.finish();
        assert_eq!(first, second);
    }

    // ── Field order independence ───────────────────────────────────────────────

    #[test]
    fn field_insertion_order_does_not_affect_hash() {
        let mut h_ab = SignatureHasher::new();
        h_ab.push_category("state");
        h_ab.add_field("a", "1");
        h_ab.add_field("b", "2");

        let mut h_ba = SignatureHasher::new();
        h_ba.push_category("state");
        h_ba.add_field("b", "2");
        h_ba.add_field("a", "1");

        assert_eq!(h_ab.finish(), h_ba.finish());
    }

    // ── Category stack order sensitivity ──────────────────────────────────────

    #[test]
    fn category_stack_order_matters() {
        let mut h1 = SignatureHasher::new();
        h1.push_category("auth");
        h1.push_category("xdr");

        let mut h2 = SignatureHasher::new();
        h2.push_category("xdr");
        h2.push_category("auth");

        assert_ne!(h1.finish(), h2.finish());
    }

    // ── Different inputs produce different hashes ──────────────────────────────

    #[test]
    fn different_categories_produce_different_hashes() {
        let mut h1 = SignatureHasher::new();
        h1.push_category("auth");

        let mut h2 = SignatureHasher::new();
        h2.push_category("budget");

        assert_ne!(h1.finish(), h2.finish());
    }

    #[test]
    fn different_field_values_produce_different_hashes() {
        let mut h1 = SignatureHasher::new();
        h1.push_category("state");
        h1.add_field("contract", "transfer");

        let mut h2 = SignatureHasher::new();
        h2.push_category("state");
        h2.add_field("contract", "mint");

        assert_ne!(h1.finish(), h2.finish());
    }

    #[test]
    fn different_field_keys_produce_different_hashes() {
        let mut h1 = SignatureHasher::new();
        h1.push_category("state");
        h1.add_field("contract", "x");

        let mut h2 = SignatureHasher::new();
        h2.push_category("state");
        h2.add_field("function", "x");

        assert_ne!(h1.finish(), h2.finish());
    }

    // ── Edge cases ────────────────────────────────────────────────────────────

    #[test]
    fn empty_hasher_produces_stable_hash() {
        let h1 = SignatureHasher::new();
        let h2 = SignatureHasher::new();
        assert_eq!(h1.finish(), h2.finish());
    }

    #[test]
    fn single_category_no_fields_is_stable() {
        let mut h1 = SignatureHasher::new();
        h1.push_category("unknown");

        let mut h2 = SignatureHasher::new();
        h2.push_category("unknown");

        assert_eq!(h1.finish(), h2.finish());
    }

    #[test]
    fn overwritten_field_uses_latest_value() {
        let mut h_overwrite = SignatureHasher::new();
        h_overwrite.push_category("auth");
        h_overwrite.add_field("k", "first");
        h_overwrite.add_field("k", "second");

        let mut h_direct = SignatureHasher::new();
        h_direct.push_category("auth");
        h_direct.add_field("k", "second");

        assert_eq!(h_overwrite.finish(), h_direct.finish());
    }

    #[test]
    fn long_category_stack_is_stable() {
        let cats = ["auth", "state", "xdr", "budget", "unknown"];

        let mut h1 = SignatureHasher::new();
        let mut h2 = SignatureHasher::new();
        for cat in cats {
            h1.push_category(cat);
            h2.push_category(cat);
        }

        assert_eq!(h1.finish(), h2.finish());
    }

    #[test]
    fn hash_category_payload_convenience_is_deterministic() {
        let h1 = hash_category_payload("runtime-failure", b"hello");
        let h2 = hash_category_payload("runtime-failure", b"hello");
        assert_eq!(h1, h2);
    }

    #[test]
    fn hash_category_payload_differs_for_different_payloads() {
        let h1 = hash_category_payload("runtime-failure", b"payload1");
        let h2 = hash_category_payload("runtime-failure", b"payload2");
        assert_ne!(h1, h2);
    }
}
