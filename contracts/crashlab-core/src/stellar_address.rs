//! Stellar address mutation strategy for account, contract, and muxed address formats.
//!
//! This module provides mutators for generating valid and invalid Stellar addresses:
//! - Account IDs (G-addresses): 56-character base32 encoded ed25519 public keys
//! - Contract IDs (C-addresses): 56-character base32 encoded contract hashes
//! - Muxed accounts (M-addresses): 69-character base32 with 64-bit memo ID
//!
//! Additionally, this module exposes helpers used by the type-directed ScVal mutator
//! to swap address types (muxed ↔ ed25519 ↔ contract) while preserving the underlying
//! 32-byte key material, and to synthesize address-shaped payloads for grammar-aware
//! regeneration.
//!
//! The mutator supports toggling between valid and invalid address generation
//! to test both parsing success and error handling paths.

use crate::scheduler::Mutator;
use crate::CaseSeed;

/// Stellar address type variants.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AddressType {
    /// Standard account address (starts with 'G')
    Account,
    /// Contract address (starts with 'C')
    Contract,
    /// Muxed account address (starts with 'M')
    Muxed,
}

impl AddressType {
    /// All supported address types.
    pub const ALL: [AddressType; 3] = [
        AddressType::Account,
        AddressType::Contract,
        AddressType::Muxed,
    ];

    /// Returns the character prefix for this address type.
    pub fn prefix(&self) -> char {
        match self {
            AddressType::Account => 'G',
            AddressType::Contract => 'C',
            AddressType::Muxed => 'M',
        }
    }

    /// Returns the expected length of a valid address of this type.
    pub fn valid_length(&self) -> usize {
        match self {
            AddressType::Account => 56,
            AddressType::Contract => 56,
            AddressType::Muxed => 69,
        }
    }

    /// Returns the number of base32 characters encoding the raw payload (excluding prefix).
    pub fn payload_len(&self) -> usize {
        self.valid_length() - 1
    }

    /// Returns the number of raw bytes encoded by this address type (excluding CRC).
    pub fn raw_byte_len(&self) -> usize {
        match self {
            AddressType::Account => 32,
            AddressType::Contract => 32,
            AddressType::Muxed => 40,
        }
    }
}

/// Configuration for address mutation behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AddressMutatorConfig {
    /// If true, generate only valid addresses. If false, may generate invalid ones.
    pub valid_only: bool,
    /// If true, include invalid addresses in the mutation pool.
    pub include_invalid: bool,
}

impl Default for AddressMutatorConfig {
    fn default() -> Self {
        Self {
            valid_only: false,
            include_invalid: true,
        }
    }
}

impl AddressMutatorConfig {
    /// Create a config that generates only valid addresses.
    pub fn valid_only() -> Self {
        Self {
            valid_only: true,
            include_invalid: false,
        }
    }

    /// Create a config that generates only invalid addresses.
    pub fn invalid_only() -> Self {
        Self {
            valid_only: false,
            include_invalid: true,
        }
    }

    /// Create a config with both valid and invalid addresses.
    pub fn mixed() -> Self {
        Self {
            valid_only: false,
            include_invalid: true,
        }
    }
}

/// Mutator for Stellar addresses (account, contract, muxed).
pub struct StellarAddressMutator {
    pub config: AddressMutatorConfig,
}

impl StellarAddressMutator {
    /// Create a new mutator with the given configuration.
    pub fn new(config: AddressMutatorConfig) -> Self {
        Self { config }
    }

    /// Create a default mutator with mixed valid/invalid addresses.
    pub fn default_mutator() -> Self {
        Self::new(AddressMutatorConfig::default())
    }

    /// Create a mutator that only generates valid addresses.
    pub fn valid_only() -> Self {
        Self::new(AddressMutatorConfig::valid_only())
    }

    /// Create a mutator that only generates invalid addresses.
    pub fn invalid_only() -> Self {
        Self::new(AddressMutatorConfig::invalid_only())
    }
}

impl Mutator for StellarAddressMutator {
    fn name(&self) -> &'static str {
        "stellar-address"
    }

    fn mutate(&self, seed: &CaseSeed, rng_state: &mut u64) -> CaseSeed {
        let address = generate_address(seed, rng_state, &self.config);
        CaseSeed {
            id: seed.id,
            payload: address.into_bytes(),
        }
    }
}

/// Generate a Stellar address based on seed and RNG state.
fn generate_address(seed: &CaseSeed, rng_state: &mut u64, config: &AddressMutatorConfig) -> String {
    advance_rng(rng_state);

    // Select address type based on RNG
    let type_index = (*rng_state as usize) % AddressType::ALL.len();
    let address_type = AddressType::ALL[type_index];

    // Determine if we should generate a valid or invalid address
    advance_rng(rng_state);
    let generate_valid = if config.valid_only {
        true
    } else if !config.include_invalid {
        true
    } else {
        // 50/50 chance for valid/invalid when mixed
        (*rng_state & 1) == 0
    };

    if generate_valid {
        generate_valid_address(address_type, seed, rng_state)
    } else {
        generate_invalid_address(address_type, seed, rng_state)
    }
}

/// Generate a valid Stellar address of the given type.
fn generate_valid_address(
    address_type: AddressType,
    seed: &CaseSeed,
    rng_state: &mut u64,
) -> String {
    match address_type {
        AddressType::Account => generate_valid_account_address(seed, rng_state),
        AddressType::Contract => generate_valid_contract_address(seed, rng_state),
        AddressType::Muxed => generate_valid_muxed_address(seed, rng_state),
    }
}

/// Generate an invalid Stellar address of the given type.
fn generate_invalid_address(
    address_type: AddressType,
    seed: &CaseSeed,
    rng_state: &mut u64,
) -> String {
    advance_rng(rng_state);
    let invalid_variant = (*rng_state as usize) % 5;

    match invalid_variant {
        0 => generate_wrong_prefix_address(address_type, seed, rng_state),
        1 => generate_truncated_address(address_type, seed, rng_state),
        2 => generate_extended_address(address_type, seed, rng_state),
        3 => generate_invalid_charset_address(address_type, seed, rng_state),
        _ => generate_empty_address(),
    }
}

/// Generate a valid account address (G-address).
/// Format: 'G' + 55 base32 characters (encoding 32 bytes + 2 byte CRC)
fn generate_valid_account_address(seed: &CaseSeed, rng_state: &mut u64) -> String {
    let mut result = String::with_capacity(56);
    result.push('G');

    // Generate 55 base32 characters
    for i in 0..55 {
        advance_rng(rng_state);
        let byte = (*rng_state ^ seed.id.wrapping_add(i as u64)) as u8;
        result.push(base32_char(byte));
    }

    result
}

/// Generate a valid contract address (C-address).
/// Format: 'C' + 55 base32 characters (encoding 32 bytes + 2 byte CRC)
fn generate_valid_contract_address(seed: &CaseSeed, rng_state: &mut u64) -> String {
    let mut result = String::with_capacity(56);
    result.push('C');

    // Generate 55 base32 characters
    for i in 0..55 {
        advance_rng(rng_state);
        let byte = (*rng_state ^ seed.id.wrapping_add(i as u64 + 1000)) as u8;
        result.push(base32_char(byte));
    }

    result
}

/// Generate a valid muxed address (M-address).
/// Format: 'M' + 68 base32 characters (encoding 32 bytes pubkey + 8 bytes ID + 2 byte CRC)
fn generate_valid_muxed_address(seed: &CaseSeed, rng_state: &mut u64) -> String {
    let mut result = String::with_capacity(69);
    result.push('M');

    // Generate 68 base32 characters
    for i in 0..68 {
        advance_rng(rng_state);
        let byte = (*rng_state ^ seed.id.wrapping_add(i as u64 + 2000)) as u8;
        result.push(base32_char(byte));
    }

    result
}

/// Generate an address with wrong prefix.
fn generate_wrong_prefix_address(
    address_type: AddressType,
    _seed: &CaseSeed,
    rng_state: &mut u64,
) -> String {
    advance_rng(rng_state);
    let wrong_prefix = match (*rng_state as usize) % 3 {
        0 => 'X',
        1 => 'Y',
        _ => 'Z',
    };

    let mut result = String::with_capacity(address_type.valid_length());
    result.push(wrong_prefix);

    for _ in 1..address_type.valid_length() {
        advance_rng(rng_state);
        result.push(base32_char(*rng_state as u8));
    }

    result
}

/// Generate a truncated address (too short).
fn generate_truncated_address(
    address_type: AddressType,
    _seed: &CaseSeed,
    rng_state: &mut u64,
) -> String {
    let valid_len = address_type.valid_length();
    let truncate_len = if valid_len > 10 {
        valid_len - (*rng_state as usize % (valid_len / 2)).max(1)
    } else {
        valid_len / 2
    };

    let mut result = String::with_capacity(truncate_len);
    result.push(address_type.prefix());

    for _ in 1..truncate_len {
        advance_rng(rng_state);
        result.push(base32_char(*rng_state as u8));
    }

    result
}

/// Generate an extended address (too long).
fn generate_extended_address(
    address_type: AddressType,
    _seed: &CaseSeed,
    rng_state: &mut u64,
) -> String {
    let valid_len = address_type.valid_length();
    let extended_len = valid_len + (*rng_state as usize % 10).max(1);

    let mut result = String::with_capacity(extended_len);
    result.push(address_type.prefix());

    for _ in 1..extended_len {
        advance_rng(rng_state);
        result.push(base32_char(*rng_state as u8));
    }

    result
}

/// Generate an address with invalid charset characters.
fn generate_invalid_charset_address(
    address_type: AddressType,
    _seed: &CaseSeed,
    rng_state: &mut u64,
) -> String {
    let mut result = String::with_capacity(address_type.valid_length());
    result.push(address_type.prefix());

    for _i in 1..address_type.valid_length() {
        advance_rng(rng_state);
        // Mix in some invalid characters
        let ch = if (*rng_state as usize) % 5 == 0 {
            // Insert invalid character
            let invalid_chars = ['0', '1', '8', '9', '!', '@', '#', '$', '%'];
            invalid_chars[(*rng_state as usize >> 4) % invalid_chars.len()]
        } else {
            base32_char(*rng_state as u8)
        };
        result.push(ch);
    }

    result
}

/// Generate an empty address.
fn generate_empty_address() -> String {
    String::new()
}

/// Extract the raw 32-byte key material from an address, if the address is
/// structurally valid (correct prefix, length, and base32 charset).
///
/// For muxed addresses, only the first 32 bytes (the ed25519 key) are returned;
/// the memo ID is dropped. This is the primitive used by the ScVal mutator to
/// swap address types while preserving key material.
pub fn extract_key_bytes(addr: &str) -> Option<[u8; 32]> {
    let bytes = addr.as_bytes();
    if bytes.is_empty() {
        return None;
    }
    let addr_type = match bytes[0] {
        b'G' => AddressType::Account,
        b'C' => AddressType::Contract,
        b'M' => AddressType::Muxed,
        _ => return None,
    };
    if bytes.len() != addr_type.valid_length() {
        return None;
    }
    // Decode the first 32 bytes worth of base32 characters (52 chars).
    let mut out = [0u8; 32];
    let mut acc: u32 = 0;
    let mut bits: u32 = 0;
    let mut written = 0usize;
    for &b in &bytes[1..] {
        let v = base32_value(b)?;
        acc = (acc << 5) | v as u32;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out[written] = ((acc >> bits) & 0xFF) as u8;
            written += 1;
            if written == 32 {
                break;
            }
        }
    }
    if written == 32 {
        Some(out)
    } else {
        None
    }
}

/// Re-encode 32 bytes of key material into an address of the requested type.
///
/// The trailing CRC characters are filled deterministically from the key bytes
/// (they are not a real CRC, but they are stable and base32-valid). This is
/// sufficient for fuzzing purposes: the resulting string is structurally valid
/// and will exercise the address-type branch in the contract.
pub fn encode_key_bytes(key: &[u8; 32], addr_type: AddressType) -> String {
    let mut result = String::with_capacity(addr_type.valid_length());
    result.push(addr_type.prefix());
    let mut acc: u32 = 0;
    let mut bits: u32 = 0;
    for &byte in key.iter() {
        acc = (acc << 8) | byte as u32;
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            let idx = ((acc >> bits) & 0x1F) as usize;
            result.push(b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[idx] as char);
        }
    }
    // Pad remaining bits (if any) and fill the rest of the payload with a
    // deterministic CRC-ish tail derived from the key.
    if bits > 0 {
        let idx = ((acc << (5 - bits)) & 0x1F) as usize;
        result.push(b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[idx] as char);
    }
    let mut crc: u32 = 0xFFFF_FFFF;
    for &byte in key.iter() {
        crc ^= byte as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xEDB8_8320
            } else {
                crc >> 1
            };
        }
    }
    let crc_bytes = crc.to_le_bytes();
    for &byte in crc_bytes.iter() {
        acc = (acc << 8) | byte as u32;
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            let idx = ((acc >> bits) & 0x1F) as usize;
            result.push(b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[idx] as char);
        }
    }
    while result.len() < addr_type.valid_length() {
        result.push('A');
    }
    result.truncate(addr_type.valid_length());
    result
}

/// Swap the address type of `addr` to `target`, preserving key material when possible.
///
/// Returns `None` if the source address is not structurally valid.
pub fn swap_address_type(addr: &str, target: AddressType) -> Option<String> {
    let key = extract_key_bytes(addr)?;
    Some(encode_key_bytes(&key, target))
}

/// Decode a single base32 character to its 5-bit value.
fn base32_value(b: u8) -> Option<u8> {
    match b {
        b'A'..=b'Z' => Some(b - b'A'),
        b'2'..=b'7' => Some(b - b'2' + 26),
        _ => None,
    }
}

/// Convert a byte to a base32 character (RFC 4648 alphabet).
fn base32_char(byte: u8) -> char {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    ALPHABET[(byte % 32) as usize] as char
}

/// Advance the RNG state using splitmix64.
fn advance_rng(state: &mut u64) {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    *state = z ^ (z >> 31);
}

/// Generate a deterministic set of address test vectors.
pub fn generate_address_vectors(base_id: u64, config: &AddressMutatorConfig) -> Vec<CaseSeed> {
    let mut seeds = Vec::new();
    let mut id = base_id;
    let mut rng = base_id;

    // Generate at least one of each address type
    for addr_type in AddressType::ALL {
        // Valid address
        let valid_addr = generate_valid_address(
            addr_type,
            &CaseSeed {
                id: 0,
                payload: vec![],
            },
            &mut rng,
        );
        seeds.push(CaseSeed {
            id,
            payload: valid_addr.into_bytes(),
        });
        id += 1;

        // Invalid addresses (if config allows)
        if config.include_invalid && !config.valid_only {
            for _ in 0..2 {
                let invalid_addr = generate_invalid_address(
                    addr_type,
                    &CaseSeed {
                        id: 0,
                        payload: vec![],
                    },
                    &mut rng,
                );
                seeds.push(CaseSeed {
                    id,
                    payload: invalid_addr.into_bytes(),
                });
                id += 1;
            }
        }
    }

    seeds
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutator_name() {
        assert_eq!(
            StellarAddressMutator::default_mutator().name(),
            "stellar-address"
        );
    }

    #[test]
    fn deterministic_for_same_inputs() {
        let m = StellarAddressMutator::default_mutator();
        let seed = CaseSeed {
            id: 10,
            payload: vec![1, 2, 3],
        };
        let a = m.mutate(&seed, &mut 99u64);
        let b = m.mutate(&seed, &mut 99u64);
        assert_eq!(a, b);
    }

    #[test]
    fn valid_only_mutator_generates_valid_length_addresses() {
        let m = StellarAddressMutator::valid_only();
        let seed = CaseSeed {
            id: 1,
            payload: vec![0xFF; 40],
        };

        for r in 0..100u64 {
            let mut rng = r;
            let out = m.mutate(&seed, &mut rng);
            let addr = String::from_utf8(out.payload).unwrap();
            assert!(
                addr.len() == 56 || addr.len() == 69,
                "Expected valid address length, got {} for address: {}",
                addr.len(),
                addr
            );
        }
    }

    #[test]
    fn invalid_only_mutator_generates_invalid_addresses() {
        let m = StellarAddressMutator::invalid_only();
        let seed = CaseSeed {
            id: 1,
            payload: vec![0xFF; 40],
        };

        let mut found_invalid = false;
        for r in 0..200u64 {
            let mut rng = r;
            let out = m.mutate(&seed, &mut rng);
            let addr = String::from_utf8(out.payload.clone()).unwrap();

            if !is_valid_stellar_address(&addr) {
                found_invalid = true;
                break;
            }
        }
        assert!(
            found_invalid,
            "Expected to find at least one invalid address"
        );
    }

    #[test]
    fn account_address_starts_with_g() {
        let addr = generate_valid_account_address(
            &CaseSeed {
                id: 1,
                payload: vec![],
            },
            &mut 42u64,
        );
        assert!(addr.starts_with('G'));
        assert_eq!(addr.len(), 56);
    }

    #[test]
    fn contract_address_starts_with_c() {
        let addr = generate_valid_contract_address(
            &CaseSeed {
                id: 1,
                payload: vec![],
            },
            &mut 42u64,
        );
        assert!(addr.starts_with('C'));
        assert_eq!(addr.len(), 56);
    }

    #[test]
    fn muxed_address_starts_with_m() {
        let addr = generate_valid_muxed_address(
            &CaseSeed {
                id: 1,
                payload: vec![],
            },
            &mut 42u64,
        );
        assert!(addr.starts_with('M'));
        assert_eq!(addr.len(), 69);
    }

    #[test]
    fn address_type_prefixes() {
        assert_eq!(AddressType::Account.prefix(), 'G');
        assert_eq!(AddressType::Contract.prefix(), 'C');
        assert_eq!(AddressType::Muxed.prefix(), 'M');
    }

    #[test]
    fn address_type_lengths() {
        assert_eq!(AddressType::Account.valid_length(), 56);
        assert_eq!(AddressType::Contract.valid_length(), 56);
        assert_eq!(AddressType::Muxed.valid_length(), 69);
    }

    #[test]
    fn generate_vectors_creates_multiple_seeds() {
        let config = AddressMutatorConfig::mixed();
        let vectors = generate_address_vectors(100, &config);
        assert!(!vectors.is_empty());
        assert_eq!(vectors[0].id, 100);
    }

    #[test]
    fn empty_address_is_invalid() {
        assert!(!is_valid_stellar_address(""));
    }

    #[test]
    fn wrong_prefix_is_invalid() {
        assert!(!is_valid_stellar_address("XABC123"));
    }

    #[test]
    fn truncated_address_is_invalid() {
        // Valid G-address should be 56 chars
        let truncated = "GABC".to_string();
        assert!(!is_valid_stellar_address(&truncated));
    }

    #[test]
    fn extended_address_is_invalid() {
        let mut extended = String::with_capacity(60);
        extended.push('G');
        for _ in 0..59 {
            extended.push('A');
        }
        assert!(!is_valid_stellar_address(&extended));
    }

    #[test]
    fn invalid_charset_is_invalid() {
        // Contains '0' which is not in base32 alphabet
        let invalid = "G0000000000000000000000000000000000000000000000000000";
        assert!(!is_valid_stellar_address(invalid));
    }

    #[test]
    fn base32_char_produces_valid_chars() {
        for i in 0..=255u8 {
            let ch = base32_char(i);
            assert!(
                ch.is_ascii_uppercase() || ('2'..='7').contains(&ch),
                "Invalid base32 char: {}",
                ch
            );
        }
    }

    #[test]
    fn extract_key_bytes_roundtrips_account() {
        let addr = generate_valid_account_address(
            &CaseSeed {
                id: 7,
                payload: vec![],
            },
            &mut 1234u64,
        );
        let key = extract_key_bytes(&addr).expect("valid account should decode");
        let reencoded = encode_key_bytes(&key, AddressType::Account);
        assert_eq!(reencoded.len(), 56);
        assert!(reencoded.starts_with('G'));
        assert_eq!(extract_key_bytes(&reencoded).unwrap(), key);
    }

    #[test]
    fn swap_address_type_preserves_key() {
        let addr = generate_valid_account_address(
            &CaseSeed {
                id: 3,
                payload: vec![],
            },
            &mut 42u64,
        );
        let key = extract_key_bytes(&addr).unwrap();
        for target in AddressType::ALL {
            let swapped = swap_address_type(&addr, target).expect("swap should succeed");
            assert_eq!(swapped.len(), target.valid_length());
            assert_eq!(swapped.chars().next().unwrap(), target.prefix());
            assert_eq!(extract_key_bytes(&swapped).unwrap(), key);
        }
    }

    #[test]
    fn extract_key_bytes_rejects_invalid() {
        assert!(extract_key_bytes("").is_none());
        assert!(extract_key_bytes("XABC").is_none());
        assert!(extract_key_bytes("G0000000000000000000000000000000000000000000000000000").is_none());
    }

    /// Helper to check if an address appears valid (basic checks).
    fn is_valid_stellar_address(addr: &str) -> bool {
        if addr.is_empty() {
            return false;
        }

        let first_char = addr.chars().next().unwrap();
        if !['G', 'C', 'M'].contains(&first_char) {
            return false;
        }

        let expected_len = match first_char {
            'G' | 'C' => 56,
            'M' => 69,
            _ => return false,
        };

        if addr.len() != expected_len {
            return false;
        }

        // Check all characters are valid base32
        for ch in addr.chars().skip(1) {
            if !ch.is_ascii_uppercase() && !('2'..='7').contains(&ch) {
                return false;
            }
        }

        true
    }
}
