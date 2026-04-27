use crashlab_core::{to_bundle, CaseSeed};

fn main() {
    // Generate test values for seed 1
    let seed1 = CaseSeed {
        id: 1,
        payload: vec![0x01, 0x02, 0x03],
    };
    let bundle1 = to_bundle(seed1);
    println!("=== Seed 1 ===");
    println!("payload: {:?}", bundle1.seed.payload);
    println!("digest: {}", bundle1.signature.digest);
    println!("signature_hash: {}", bundle1.signature.signature_hash);
    println!("category: {}", bundle1.signature.category);
    println!();

    // Generate test values for seed 42
    let seed42 = CaseSeed {
        id: 42,
        payload: vec![0x01, 0x02, 0x03],
    };
    let bundle42 = to_bundle(seed42);
    println!("=== Seed 42 ===");
    println!("payload: {:?}", bundle42.seed.payload);
    println!("digest: {}", bundle42.signature.digest);
    println!("signature_hash: {}", bundle42.signature.signature_hash);
    println!("category: {}", bundle42.signature.category);
    println!();

    // Generate test values for seed 99 (empty)
    let seed99 = CaseSeed {
        id: 99,
        payload: vec![],
    };
    let bundle99 = to_bundle(seed99);
    println!("=== Seed 99 (empty) ===");
    println!("payload: {:?}", bundle99.seed.payload);
    println!("digest: {}", bundle99.signature.digest);
    println!("signature_hash: {}", bundle99.signature.signature_hash);
    println!("category: {}", bundle99.signature.category);
}
