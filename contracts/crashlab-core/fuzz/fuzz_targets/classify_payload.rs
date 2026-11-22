#![no_main]

use crashlab_core::{classify_failure, CaseSeed};
use libfuzzer_sys::fuzz_target;

const MAX_INPUT_BYTES: usize = 8 * 1024;

fuzz_target!(|data: &[u8]| {
    if data.len() > MAX_INPUT_BYTES {
        return;
    }

    let seed = CaseSeed { id: data.len() as u64, payload: data.to_vec() };
    let _ = classify_failure(&seed);
});
