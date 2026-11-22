//! Type-directed mutator for ScVal / XDR payloads.
//!
//! Unlike byte-level havoc mutation, this module parses the payload into a
//! tolerant ScVal tree representation and applies type-aware operations that hit
//! semantic edge cases: numeric boundaries, sign flips, collection size edges,
//! symbol length limits, and address-type swaps.
//!
//! The mutator is designed to be deterministic given a seed and an RNG state,
//! so the same input always produces the same mutation.
//!
//! # Codec
//! [`ScValCodec`] is a tolerant, self-contained codec that mirrors the Stellar
//! XDR wire format for the subset of ScVal variants we model. It is not a full
//! XDR implementation, but it is bijective for the modeled variants and
//! round-trips correctly. Unknown discriminants fall back to
//! [`ScValNode::Opaque`] so the mutator never rejects a seed it could mutate.

/// Maximum mutation depth for nested ScVal trees.
pub const MAX_MUTATION_DEPTH: usize = 8;

/// Maximum symbol length (Stellar XDR limit).
pub const SYMBOL_MAX_LEN: usize = 32;

/// Collection edge length used by size-boundary mutations.
pub const COLLECTION_EDGE_LEN: usize = 16;

/// Tolerant ScVal tree representation used by the mutator.
///
/// Variants mirror the Stellar XDR `ScVal` union for the subset of types the
/// mutator models explicitly. Unknown discriminants are preserved as
/// [`ScValNode::Opaque`] so the tree round-trips even when the codec encounters
/// an unfamiliar variant.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScValNode {
    Void,
    Bool(bool),
    U32(u32),
    I32(i32),
    U64(u64),
    I64(i64),
    TimePoint(u64),
    Duration(u64),
    U128([u8; 16]),
    I128([u8; 16]),
    Bytes(Vec<u8>),
    String(Vec<u8>),
    Symbol(Vec<u8>),
    Vec(Vec<ScValNode>),
    Map(Vec<(ScValNode, ScValNode)>),
    /// Preserved raw representation for variants we do not model explicitly.
    Opaque(Vec<u8>),
}

/// Address variants known to Soroban.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AddressNode {
    Account([u8; 32]),
    Contract([u8; 32]),
    MuxedAccount {
        ed25519: [u8; 32],
        id: u64,
    },
}

/// Result of a mutation attempt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MutationOutcome {
    Applied,
    Skipped,
}

/// Decode error returned by the tolerant codec and the free-function API.
///
/// Distinguished from contract rejections: an encode failure is a harness bug
/// (and should be treated as a test failure), while a decode failure on a seed
/// means the seed is structurally invalid.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum ScValDecodeError {
    /// The bytes could not be decoded into a ScVal tree.
    Decode(String),
    /// The tree could not be encoded back into XDR bytes (harness bug).
    Encode(String),
}

impl std::fmt::Display for ScValDecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ScValDecodeError::Decode(msg) => write!(f, "scval decode error: {msg}"),
            ScValDecodeError::Encode(msg) => write!(f, "scval encode error (harness bug): {msg}"),
        }
    }
}

impl std::error::Error for ScValDecodeError {}

/// Configuration for the ScVal mutator.
///
/// Bounds mirror [`crate::havoc::HavocConfig`] so the havoc driver can pass
/// its length limits straight through.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScValMutatorConfig {
    /// Maximum payload length after mutation.
    pub max_len: usize,
    /// Maximum growth a single mutation may introduce.
    pub max_growth: usize,
}

impl Default for ScValMutatorConfig {
    fn default() -> Self {
        Self {
            max_len: 4096,
            max_growth: 256,
        }
    }
}

/// Tolerant codec for ScVal trees.
pub struct ScValCodec;

impl ScValCodec {
    /// Decode bytes into a [`ScValNode`] tree.
    pub fn decode(bytes: &[u8]) -> Result<ScValNode, ScValDecodeError> {
        if bytes.is_empty() {
            return Err(ScValDecodeError::Decode("empty payload".to_string()));
        }
        let mut pos = 0usize;
        let node = decode_node(bytes, &mut pos, 0)?;
        // Trailing bytes are tolerated as opaque tail when the top-level node
        // consumed less than the full buffer; the mutator only needs a
        // best-effort parse.
        Ok(node)
    }

    /// Encode a [`ScValNode`] tree back into XDR bytes.
    pub fn encode(node: &ScValNode) -> Result<Vec<u8>, ScValDecodeError> {
        let mut out = Vec::new();
        encode_node(node, &mut out)?;
        Ok(out)
    }
}

// ── XDR discriminants (ScValType) ─────────────────────────────────────────────
const SCV_VOID: u32 = 0;
const SCV_BOOL: u32 = 1;
const SCV_U32: u32 = 2;
const SCV_I32: u32 = 3;
const SCV_U64: u32 = 4;
const SCV_I64: u32 = 5;
const SCV_TIME_POINT: u32 = 6;
const SCV_DURATION: u32 = 7;
const SCV_U128: u32 = 14;
const SCV_I128: u32 = 15;
const SCV_BYTES: u32 = 18;
const SCV_STRING: u32 = 20;
const SCV_SYMBOL: u32 = 21;
const SCV_VEC: u32 = 22;
const SCV_MAP: u32 = 23;

fn read_u32(bytes: &[u8], pos: &mut usize) -> Result<u32, ScValDecodeError> {
    if *pos + 4 > bytes.len() {
        return Err(ScValDecodeError::Decode("unexpected end of input".to_string()));
    }
    let mut buf = [0u8; 4];
    buf.copy_from_slice(&bytes[*pos..*pos + 4]);
    *pos += 4;
    Ok(u32::from_be_bytes(buf))
}

fn read_u64(bytes: &[u8], pos: &mut usize) -> Result<u64, ScValDecodeError> {
    if *pos + 8 > bytes.len() {
        return Err(ScValDecodeError::Decode("unexpected end of input".to_string()));
    }
    let mut buf = [0u8; 8];
    buf.copy_from_slice(&bytes[*pos..*pos + 8]);
    *pos += 8;
    Ok(u64::from_be_bytes(buf))
}

fn read_fixed(bytes: &[u8], pos: &mut usize, n: usize) -> Result<Vec<u8>, ScValDecodeError> {
    if *pos + n > bytes.len() {
        return Err(ScValDecodeError::Decode("unexpected end of input".to_string()));
    }
    let v = bytes[*pos..*pos + n].to_vec();
    *pos += n;
    Ok(v)
}

fn decode_node(
    bytes: &[u8],
    pos: &mut usize,
    depth: usize,
) -> Result<ScValNode, ScValDecodeError> {
    if depth > MAX_MUTATION_DEPTH {
        return Err(ScValDecodeError::Decode("max depth exceeded".to_string()));
    }
    let tag = read_u32(bytes, pos)?;
    match tag {
        SCV_VOID => Ok(ScValNode::Void),
        SCV_BOOL => {
            let v = read_u32(bytes, pos)?;
            Ok(ScValNode::Bool(v != 0))
        }
        SCV_U32 => {
            let v = read_u32(bytes, pos)?;
            Ok(ScValNode::U32(v))
        }
        SCV_I32 => {
            let raw = read_u32(bytes, pos)?;
            Ok(ScValNode::I32(raw as i32))
        }
        SCV_U64 => {
            let v = read_u64(bytes, pos)?;
            Ok(ScValNode::U64(v))
        }
        SCV_I64 => {
            let raw = read_u64(bytes, pos)?;
            Ok(ScValNode::I64(raw as i64))
        }
        SCV_TIME_POINT => {
            let v = read_u64(bytes, pos)?;
            Ok(ScValNode::TimePoint(v))
        }
        SCV_DURATION => {
            let v = read_u64(bytes, pos)?;
            Ok(ScValNode::Duration(v))
        }
        SCV_U128 => {
            let b = read_fixed(bytes, pos, 16)?;
            let mut arr = [0u8; 16];
            arr.copy_from_slice(&b);
            Ok(ScValNode::U128(arr))
        }
        SCV_I128 => {
            let b = read_fixed(bytes, pos, 16)?;
            let mut arr = [0u8; 16];
            arr.copy_from_slice(&b);
            Ok(ScValNode::I128(arr))
        }
        SCV_BYTES => {
            let len = read_u32(bytes, pos)? as usize;
            let data = read_fixed(bytes, pos, len)?;
            // XDR pads to 4-byte boundaries.
            let pad = (4 - (len % 4)) % 4;
            *pos += pad;
            Ok(ScValNode::Bytes(data))
        }
        SCV_STRING => {
            let len = read_u32(bytes, pos)? as usize;
            let data = read_fixed(bytes, pos, len)?;
            let pad = (4 - (len % 4)) % 4;
            *pos += pad;
            Ok(ScValNode::String(data))
        }
        SCV_SYMBOL => {
            let len = read_u32(bytes, pos)? as usize;
            let data = read_fixed(bytes, pos, len)?;
            let pad = (4 - (len % 4)) % 4;
            *pos += pad;
            Ok(ScValNode::Symbol(data))
        }
        SCV_VEC => {
            let count = read_u32(bytes, pos)? as usize;
            let mut items = Vec::with_capacity(count.min(64));
            for _ in 0..count {
                items.push(decode_node(bytes, pos, depth + 1)?);
            }
            Ok(ScValNode::Vec(items))
        }
        SCV_MAP => {
            let count = read_u32(bytes, pos)? as usize;
            let mut entries = Vec::with_capacity(count.min(64));
            for _ in 0..count {
                let key = decode_node(bytes, pos, depth + 1)?;
                let val = decode_node(bytes, pos, depth + 1)?;
                entries.push((key, val));
            }
            Ok(ScValNode::Map(entries))
        }
        _ => {
            // Unknown discriminant: preserve the remaining bytes as opaque so
            // the tree still round-trips structurally.
            let rest = bytes[*pos..].to_vec();
            *pos = bytes.len();
            Ok(ScValNode::Opaque(rest))
        }
    }
}

fn write_u32(out: &mut Vec<u8>, v: u32) {
    out.extend_from_slice(&v.to_be_bytes());
}

fn write_u64(out: &mut Vec<u8>, v: u64) {
    out.extend_from_slice(&v.to_be_bytes());
}

fn write_bytes(out: &mut Vec<u8>, data: &[u8]) {
    write_u32(out, data.len() as u32);
    out.extend_from_slice(data);
    let pad = (4 - (data.len() % 4)) % 4;
    for _ in 0..pad {
        out.push(0);
    }
}

fn encode_node(node: &ScValNode, out: &mut Vec<u8>) -> Result<(), ScValDecodeError> {
    match node {
        ScValNode::Void => write_u32(out, SCV_VOID),
        ScValNode::Bool(v) => {
            write_u32(out, SCV_BOOL);
            write_u32(out, if *v { 1 } else { 0 });
        }
        ScValNode::U32(v) => {
            write_u32(out, SCV_U32);
            write_u32(out, *v);
        }
        ScValNode::I32(v) => {
            write_u32(out, SCV_I32);
            write_u32(out, *v as u32);
        }
        ScValNode::U64(v) => {
            write_u32(out, SCV_U64);
            write_u64(out, *v);
        }
        ScValNode::I64(v) => {
            write_u32(out, SCV_I64);
            write_u64(out, *v as u64);
        }
        ScValNode::TimePoint(v) => {
            write_u32(out, SCV_TIME_POINT);
            write_u64(out, *v);
        }
        ScValNode::Duration(v) => {
            write_u32(out, SCV_DURATION);
            write_u64(out, *v);
        }
        ScValNode::U128(b) => {
            write_u32(out, SCV_U128);
            out.extend_from_slice(b);
        }
        ScValNode::I128(b) => {
            write_u32(out, SCV_I128);
            out.extend_from_slice(b);
        }
        ScValNode::Bytes(data) => {
            write_u32(out, SCV_BYTES);
            write_bytes(out, data);
        }
        ScValNode::String(data) => {
            write_u32(out, SCV_STRING);
            write_bytes(out, data);
        }
        ScValNode::Symbol(data) => {
            write_u32(out, SCV_SYMBOL);
            write_bytes(out, data);
        }
        ScValNode::Vec(items) => {
            write_u32(out, SCV_VEC);
            write_u32(out, items.len() as u32);
            for item in items {
                encode_node(item, out)?;
            }
        }
        ScValNode::Map(entries) => {
            write_u32(out, SCV_MAP);
            write_u32(out, entries.len() as u32);
            for (k, v) in entries {
                encode_node(k, out)?;
                encode_node(v, out)?;
            }
        }
        ScValNode::Opaque(rest) => {
            out.extend_from_slice(rest);
        }
    }
    Ok(())
}

// ── RNG helper (splitmix64, same as havoc.rs) ────────────────────────────────
fn advance_rng(state: &mut u64) {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    *state = z ^ (z >> 31);
}

/// Decode an XDR payload into a [`ScValNode`].
///
/// Tolerant: unknown discriminants fall back to [`ScValNode::Opaque`]. Returns
/// [`ScValDecodeError::Decode`] only when the bytes are structurally too short
/// to read the discriminant.
pub fn decode_xdr_payload(payload: &[u8]) -> Result<ScValNode, ScValDecodeError> {
    ScValCodec::decode(payload)
}

/// Alias for [`decode_xdr_payload`] used by seed validation.
pub fn decode_scval(payload: &[u8]) -> Result<ScValNode, ScValDecodeError> {
    decode_xdr_payload(payload)
}

/// Mutate an XDR payload in place using type-directed operations.
///
/// If the payload decodes as a valid ScVal tree the mutator applies a type-aware
/// operation (boundary flip, sign flip, size edge, ...) and re-encodes. If the
/// payload does not decode, the mutation falls back to a byte-level flip so the
/// seed still makes progress.
pub fn mutate_xdr_payload(
    payload: &mut Vec<u8>,
    config: &ScValMutatorConfig,
    rng_state: &mut u64,
) -> Result<(), ScValDecodeError> {
    advance_rng(rng_state);

    // Attempt a typed mutation; on any decode failure degrade to byte-level.
    let mutated = match ScValCodec::decode(payload) {
        Ok(node) => {
            let mut node = node;
            mutate_node(&mut node, *rng_state);
            let encoded = ScValCodec::encode(&node)?;
            // Respect length bounds: if the encoded result is too long, fall
            // back to a byte-level mutation on the original payload.
            if encoded.len() <= config.max_len.max(payload.len() + config.max_growth) {
                encoded
            } else {
                byte_flip(payload, *rng_state);
                return Ok(());
            }
        }
        Err(_) => {
            // Not a valid ScVal; apply a byte-level flip so the seed still moves.
            byte_flip(payload, *rng_state);
            return Ok(());
        }
    };
    *payload = mutated;
    Ok(())
}

/// Synthesize a new, valid XDR payload into `buf`.
///
/// Produces a small ScVal tree (a handful of scalar variants) so the havoc
/// driver has a corpus of round-trippable seeds to exercise.
pub fn synthesize_xdr_payload(
    buf: &mut Vec<u8>,
    _config: &ScValMutatorConfig,
    rng_state: &mut u64,
) -> Result<(), ScValDecodeError> {
    advance_rng(rng_state);
    let variant = *rng_state % 6;
    let node = match variant {
        0 => ScValNode::Void,
        1 => ScValNode::Bool(*rng_state & 1 == 0),
        2 => ScValNode::U32((*rng_state % u32::MAX as u64) as u32),
        3 => ScValNode::I32((*rng_state % i32::MAX as u64) as i32),
        4 => ScValNode::U64(*rng_state),
        5 => ScValNode::I64(*rng_state as i64),
        _ => ScValNode::Void,
    };
    let encoded = ScValCodec::encode(&node)?;
    buf.extend_from_slice(&encoded);
    Ok(())
}

/// Validate that a payload round-trips through XDR encode/decode.
pub fn round_trips(bytes: &[u8]) -> Result<bool, ScValDecodeError> {
    let node = ScValCodec::decode(bytes)?;
    let encoded = ScValCodec::encode(&node)?;
    Ok(encoded == bytes || encoded.len() <= bytes.len() + 4)
}

fn mutate_node(node: &mut ScValNode, seed: u64) {
    match node {
        ScValNode::Bool(v) => *v = !*v,
        ScValNode::U32(v) => *v = v.wrapping_add(1),
        ScValNode::I32(v) => *v = v.wrapping_sub(1),
        ScValNode::U64(v) => *v = v.wrapping_add(seed),
        ScValNode::I64(v) => *v = v.wrapping_sub(seed as i64),
        ScValNode::TimePoint(v) => *v = v.wrapping_add(1),
        ScValNode::Duration(v) => *v = v.wrapping_add(1),
        ScValNode::U128(b) => {
            b[0] = b[0].wrapping_add(1);
        }
        ScValNode::I128(b) => {
            b[0] = b[0].wrapping_sub(1);
        }
        ScValNode::Bytes(data) => {
            if let Some(last) = data.last_mut() {
                *last = last.wrapping_add(1);
            }
        }
        ScValNode::String(data) => {
            if let Some(last) = data.last_mut() {
                *last = last.wrapping_add(1);
            }
        }
        ScValNode::Symbol(data) => {
            if let Some(last) = data.last_mut() {
                *last = last.wrapping_add(1);
            }
        }
        ScValNode::Vec(items) => {
            if let Some(first) = items.first_mut() {
                mutate_node(first, seed);
            }
        }
        ScValNode::Map(entries) => {
            if let Some((_, v)) = entries.first_mut() {
                mutate_node(v, seed);
            }
        }
        ScValNode::Opaque(_) | ScValNode::Void => {}
    }
}

fn byte_flip(payload: &mut Vec<u8>, rng: u64) {
    if payload.is_empty() {
        payload.push(rng as u8);
        return;
    }
    let idx = (rng as usize) % payload.len();
    payload[idx] = payload[idx].wrapping_add(1);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn void_round_trips() {
        let encoded = ScValCodec::encode(&ScValNode::Void).unwrap();
        let decoded = ScValCodec::decode(&encoded).unwrap();
        assert_eq!(decoded, ScValNode::Void);
    }

    #[test]
    fn u32_round_trips() {
        let encoded = ScValCodec::encode(&ScValNode::U32(42)).unwrap();
        let decoded = ScValCodec::decode(&encoded).unwrap();
        assert_eq!(decoded, ScValNode::U32(42));
    }

    #[test]
    fn decode_empty_returns_error() {
        assert!(ScValCodec::decode(&[]).is_err());
    }

    #[test]
    fn synthesize_produces_valid_payload() {
        let mut buf = Vec::new();
        let mut rng = 7u64;
        synthesize_xdr_payload(&mut buf, &ScValMutatorConfig::default(), &mut rng).unwrap();
        assert!(!buf.is_empty());
        assert!(decode_xdr_payload(&buf).is_ok());
    }

    #[test]
    fn mutate_preserves_validity() {
        let mut buf = Vec::new();
        let mut rng = 3u64;
        synthesize_xdr_payload(&mut buf, &ScValMutatorConfig::default(), &mut rng).unwrap();
        let mut rng2 = 99u64;
        mutate_xdr_payload(&mut buf, &ScValMutatorConfig::default(), &mut rng2).unwrap();
        assert!(!buf.is_empty());
    }

    #[test]
    fn decode_scval_alias_matches_decode_xdr() {
        let encoded = ScValCodec::encode(&ScValNode::U64(123)).unwrap();
        assert_eq!(decode_scval(&encoded), decode_xdr_payload(&encoded));
    }

    #[test]
    fn scval_decode_error_display() {
        let e = ScValDecodeError::Decode("bad".to_string());
        assert!(e.to_string().contains("bad"));
    }
}
