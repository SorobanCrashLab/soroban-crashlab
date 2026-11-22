//! Client-Side WASM Analysis Engine core kernels (#2318).
//!
//! Compiles to `wasm32-unknown-unknown` with zero external runtime dependencies
//! so the binary remains compact (< 1 KB), deterministic across all browser engines,
//! and compatible with strict CSP (`wasm-unsafe-eval`, no JS `eval`).

#![no_std]

use core::slice;

const FNV_OFFSET_BASIS_32: u32 = 0x811c_9dc5;
const FNV_PRIME_32: u32 = 0x0100_0193;

/// Computes the deterministic 32-bit FNV-1a digest over `[ptr, ptr + len)`.
#[no_mangle]
pub extern "C" fn fnv1a32(ptr: *const u8, len: usize) -> u32 {
    if ptr.is_null() || len == 0 {
        return FNV_OFFSET_BASIS_32;
    }
    let bytes = unsafe { slice::from_raw_parts(ptr, len) };
    let mut hash = FNV_OFFSET_BASIS_32;
    let mut i = 0;
    while i < bytes.len() {
        hash ^= bytes[i] as u32;
        hash = hash.wrapping_mul(FNV_PRIME_32);
        i += 1;
    }
    hash
}

/// Counts occurrences of `target` byte value in `[ptr, ptr + len)`.
#[no_mangle]
pub extern "C" fn count_byte_value(ptr: *const u8, len: usize, target: u32) -> usize {
    if ptr.is_null() || len == 0 {
        return 0;
    }
    let bytes = unsafe { slice::from_raw_parts(ptr, len) };
    let target_u8 = (target & 0xff) as u8;
    let mut count = 0usize;
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == target_u8 {
            count += 1;
        }
        i += 1;
    }
    count
}

/// Counts printable ASCII bytes (`0x20..=0x7e`) in `[ptr, ptr + len)`.
#[no_mangle]
pub extern "C" fn count_ascii_printable(ptr: *const u8, len: usize) -> usize {
    if ptr.is_null() || len == 0 {
        return 0;
    }
    let bytes = unsafe { slice::from_raw_parts(ptr, len) };
    let mut count = 0usize;
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b >= 0x20 && b <= 0x7e {
            count += 1;
        }
        i += 1;
    }
    count
}

/// Computes an 8-bit XOR checksum across `[ptr, ptr + len)`.
#[no_mangle]
pub extern "C" fn xor_checksum(ptr: *const u8, len: usize) -> u32 {
    if ptr.is_null() || len == 0 {
        return 0;
    }
    let bytes = unsafe { slice::from_raw_parts(ptr, len) };
    let mut acc = 0u32;
    let mut i = 0;
    while i < bytes.len() {
        acc ^= bytes[i] as u32;
        i += 1;
    }
    acc
}

#[cfg(not(test))]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}
