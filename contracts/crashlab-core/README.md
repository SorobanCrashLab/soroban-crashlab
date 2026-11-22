# Integrator Guide for crashlab-core

## Overview
This guide explains how to integrate the **crashlab-core** crate with a Soroban test runner. It covers wiring the core library, building the project, and running tests in CI.

## Wiring the Runner
1. **Add as a dependency**
   ```toml
   [dependencies]
   crashlab-core = { path = "../crashlab-core" }
   ```
   Ensure the `Cargo.toml` of your test runner points to this relative path.

2. **Import the library**
   ```rust
   use crashlab_core::{run_simulation_with_timeout, seed_validator::validate, runner::Runner};
   ```
   The `Runner` struct provides the high‑level API to execute a fuzz campaign.

3. **Configure the runner**
   ```rust
   let runner = Runner::builder()
       .seed_source("./seeds.json")
       .output_dir("./artifacts")
       .build()?;
   ```
   Adjust the paths to match your project layout.

4. **Execute a run**
   ```rust
   let result = runner.run()?;
   println!("Run completed: {} seeds processed", result.seeds_processed);
   ```
   The runner handles checkpointing, retry logic, and metric collection automatically.

## Build Steps
```bash
# From the repository root
cd contracts/crashlab-core
cargo build --release   # Build the library
```
The library compiles to a static `rlib` that can be linked into any Soroban test binary.

## CI Integration
Add the following steps to your CI pipeline (GitHub Actions example):
```yaml
- name: Checkout repository
  uses: actions/checkout@v4

- name: Install Rust
  uses: actions-rs/toolchain@v1
  with:
    toolchain: stable
    profile: minimal
    override: true

- name: Build crashlab-core
  run: |
    cd contracts/crashlab-core
    cargo build --release

- name: Run core tests
  run: |
    cd contracts/crashlab-core
    cargo test --all-targets
```
The `cargo test` command validates that the library compiles and its unit tests pass. CI should fail if any test fails, ensuring the integration remains stable.

---
*This file is documentation‑only and does not affect build artifacts.*
