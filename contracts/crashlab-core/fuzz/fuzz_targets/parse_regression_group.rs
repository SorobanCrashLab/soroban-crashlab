#![no_main]

use crashlab_core::RegressionGroup;
use libfuzzer_sys::fuzz_target;

const MAX_INPUT_BYTES: usize = 8 * 1024;

fuzz_target!(|data: &[u8]| {
    if data.len() > MAX_INPUT_BYTES {
        return;
    }

    let input = String::from_utf8_lossy(data);
    let _ = RegressionGroup::from_stable_string(&input);
});
