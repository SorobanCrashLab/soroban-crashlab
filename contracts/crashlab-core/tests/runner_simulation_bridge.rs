use crashlab_core::{
    run_simulation_with_timeout, CaseSeed, SimulationTimeoutConfig,
};

#[test]
fn simulation_runner_bridge_closure_runs_and_can_timeout() {
    let seed = CaseSeed {
        id: 1,
        payload: vec![1, 2, 3],
    };

    // Fast path
    let cfg = SimulationTimeoutConfig::new(500);
    let sig = run_simulation_with_timeout(&seed, &cfg, |s| {
        // Signature category will be based on crashlab_core::classify.
        // Use the same payload to avoid accidental timeout category.
        crashlab_core::classify(s)
    });
    assert_ne!(sig.category, "timeout");

    // Timeout path
    let cfg = SimulationTimeoutConfig::new(5);
    let seed_clone = seed.clone();
    let sig = run_simulation_with_timeout(&seed, &cfg, move |_s| {
        std::thread::sleep(std::time::Duration::from_millis(50));
        crashlab_core::classify(&seed_clone)
    });
    assert_eq!(sig.category, "timeout");
}

