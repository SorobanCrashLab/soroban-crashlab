# soroban-example

A minimal Soroban token contract implementing basic ERC-20-like functionality: `initialize`, `transfer`, `mint`, `burn`, `approve`, `allowance`, and `transfer_from`.

## Build

Compile the contract to a WASM blob deployable to any Soroban network:

```bash
cargo build --target wasm32-unknown-unknown --release
```

The output WASM is written to:

```
target/wasm32-unknown-unknown/release/soroban_example.wasm
```

## Test

```bash
cargo test --all-targets
```

## Size Budget

Contract WASM size is tracked and enforced in CI to avoid deployment limit and fee regressions.

- **Baseline**: 9,112 bytes
- **Budget**: 11,000 bytes (~20% headroom over baseline)

To check and enforce the budget locally:

```bash
cargo build --target wasm32-unknown-unknown --release
./report-size.sh
```

## Deploy targets

The contract can be deployed to any Soroban-enabled network. The table below lists the available targets and the corresponding `soroban` CLI flags.

| Target       | `--network` value | `--rpc-url`                                                        |
| ------------ | ----------------- | ------------------------------------------------------------------ |
| Standalone   | `local`           | `http://localhost:8000` (default `soroban network start`)          |
| Testnet      | `testnet`         | `https://soroban-testnet.stellar.org`                              |
| Mainnet      | `mainnet`         | `https://soroban.stellar.org`                                      |

### Prerequisites

- [Soroban CLI](https://soroban.stellar.org/docs/building-apps/setup)
- Rust `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`)

### Deploy

Install the Soroban CLI, then deploy the contract with:

```bash
# Standalone (local)
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/soroban_example.wasm \
  --network local

# Testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/soroban_example.wasm \
  --network testnet

# Mainnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/soroban_example.wasm \
  --network mainnet
```

Each `deploy` invocation returns the deployed contract's **C-prefixed address** (e.g., `CA3D...`). Save this address — it is required to invoke contract functions from the CLI or from `crashlab-core` host runners.

### Initialize

After deployment, initialize the contract with an admin address and total supply:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- \
  initialize \
  --admin <ADMIN_ADDRESS> \
  --total_supply 1000000
```

### Contract address format

Deployed Soroban contracts are identified by a **C-prefixed Stellar address** (e.g., `CA3D...`). This address is used in all subsequent invocations and is the format `crashlab-core` expects when configuring contract targets for fuzzing campaigns.
