//! Deterministic, type-aware neighbors for valid Stellar addresses.
//!
//! These strategies keep an address in the repository's address-shaped
//! encoding while changing one key boundary or type. They are useful for exploring authorization and
//! type-confusion edges that whole-address randomization rarely reaches.

use crate::stellar_address::{encode_key_bytes, extract_key_bytes, AddressType};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AddressNeighborStrategy {
    FlipFirstBit,
    FlipSecondBit,
    FlipLastBit,
    ZeroKey,
    MaxKey,
    HighBitKey,
    LowBitKey,
    IncrementFirstByte,
    DecrementFirstByte,
    IncrementLastByte,
    DecrementLastByte,
    AsAccount,
    AsContract,
    AsMuxed,
    FlipMiddleBit,
}

impl AddressNeighborStrategy {
    pub const ALL: [Self; 15] = [
        Self::FlipFirstBit,
        Self::FlipSecondBit,
        Self::FlipLastBit,
        Self::ZeroKey,
        Self::MaxKey,
        Self::HighBitKey,
        Self::LowBitKey,
        Self::IncrementFirstByte,
        Self::DecrementFirstByte,
        Self::IncrementLastByte,
        Self::DecrementLastByte,
        Self::AsAccount,
        Self::AsContract,
        Self::AsMuxed,
        Self::FlipMiddleBit,
    ];

    pub const fn name(self) -> &'static str {
        match self {
            Self::FlipFirstBit => "flip_first_key_bit",
            Self::FlipSecondBit => "flip_second_key_bit",
            Self::FlipLastBit => "flip_last_key_bit",
            Self::ZeroKey => "zero_key_boundary",
            Self::MaxKey => "max_key_boundary",
            Self::HighBitKey => "high_bit_boundary",
            Self::LowBitKey => "low_bit_boundary",
            Self::IncrementFirstByte => "increment_first_key_byte",
            Self::DecrementFirstByte => "decrement_first_key_byte",
            Self::IncrementLastByte => "increment_last_key_byte",
            Self::DecrementLastByte => "decrement_last_key_byte",
            Self::AsAccount => "reinterpret_as_account",
            Self::AsContract => "reinterpret_as_contract",
            Self::AsMuxed => "reinterpret_as_muxed_account",
            Self::FlipMiddleBit => "flip_middle_key_bit",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AddressNeighbor {
    pub strategy: &'static str,
    pub expected_type: AddressType,
    pub generated_type: AddressType,
    pub address: String,
}

/// Generate the registered neighbors for a valid structural address. The
/// expected type is retained in each row so callers can enforce the function
/// signature while still trying cross-type values deliberately.
pub fn generate_address_neighbors(address: &str) -> Option<Vec<AddressNeighbor>> {
    let key = extract_key_bytes(address)?;
    let expected_type = AddressType::ALL
        .into_iter()
        .find(|kind| address.starts_with(kind.prefix()) && address.len() == kind.valid_length())?;
    let mut neighbors = Vec::with_capacity(AddressNeighborStrategy::ALL.len());

    for strategy in AddressNeighborStrategy::ALL {
        let mut mutated = key;
        let generated_type = match strategy {
            AddressNeighborStrategy::FlipFirstBit => {
                mutated[0] ^= 0x80;
                expected_type
            }
            AddressNeighborStrategy::FlipSecondBit => {
                mutated[0] ^= 0x40;
                expected_type
            }
            AddressNeighborStrategy::FlipLastBit => {
                mutated[31] ^= 0x01;
                expected_type
            }
            AddressNeighborStrategy::ZeroKey => {
                mutated = [0; 32];
                expected_type
            }
            AddressNeighborStrategy::MaxKey => {
                mutated = [u8::MAX; 32];
                expected_type
            }
            AddressNeighborStrategy::HighBitKey => {
                mutated = [0x80; 32];
                expected_type
            }
            AddressNeighborStrategy::LowBitKey => {
                mutated = [0x01; 32];
                expected_type
            }
            AddressNeighborStrategy::IncrementFirstByte => {
                mutated[0] = mutated[0].wrapping_add(1);
                expected_type
            }
            AddressNeighborStrategy::DecrementFirstByte => {
                mutated[0] = mutated[0].wrapping_sub(1);
                expected_type
            }
            AddressNeighborStrategy::IncrementLastByte => {
                mutated[31] = mutated[31].wrapping_add(1);
                expected_type
            }
            AddressNeighborStrategy::DecrementLastByte => {
                mutated[31] = mutated[31].wrapping_sub(1);
                expected_type
            }
            AddressNeighborStrategy::AsAccount => AddressType::Account,
            AddressNeighborStrategy::AsContract => AddressType::Contract,
            AddressNeighborStrategy::AsMuxed => AddressType::Muxed,
            AddressNeighborStrategy::FlipMiddleBit => {
                mutated[16] ^= 0x08;
                expected_type
            }
        };
        neighbors.push(AddressNeighbor {
            strategy: strategy.name(),
            expected_type,
            generated_type,
            address: encode_key_bytes(&mutated, generated_type),
        });
    }

    Some(neighbors)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stellar_address::encode_key_bytes;

    #[test]
    fn emits_fifteen_named_deterministic_neighbors() {
        let source = encode_key_bytes(&[0x23; 32], AddressType::Account);
        let first = generate_address_neighbors(&source).unwrap();
        let second = generate_address_neighbors(&source).unwrap();
        assert_eq!(first, second);
        assert_eq!(first.len(), 15);
        assert_eq!(
            first
                .iter()
                .map(|item| item.strategy)
                .collect::<std::collections::BTreeSet<_>>()
                .len(),
            15
        );
        assert!(first
            .iter()
            .all(|item| item.address.len() == item.generated_type.valid_length()));
        assert!(first
            .iter()
            .all(|item| item.expected_type == AddressType::Account));
    }

    #[test]
    fn rejects_inputs_that_are_not_address_shaped() {
        assert!(generate_address_neighbors("not-an-address").is_none());
    }
}
