# Contract Call Builder

The composer is available at `/contracts/compose`. It provides a sample interface, upload for the JSON `ContractSpec` format, typed inputs and client-side validation, ordered multi-call scenarios, an optional earlier-step dependency, conditions, local versioned browser drafts, deterministic JSON export, and a static preflight endpoint.

## Current scope and safety

This is the first usable vertical slice, not a live Soroban transaction composer. The app does not decode WASM contract specs, generate XDR, connect to Stellar RPC, estimate real resource footprints, sign, or submit transactions. The JSON payload preview is canonical scenario JSON, not XDR. The preflight endpoint uses the bundled sample schema and explicitly reports that live simulation is unavailable. It never makes a network call to Stellar.

Uploaded interfaces must be JSON matching `ContractSpec`:

```json
{
  "contractId": "contract identifier",
  "name": "My contract",
  "network": "testnet",
  "functions": [
    { "name": "set_value", "mutability": "write", "args": [
      { "name": "value", "type": { "kind": "u32" } }
    ] }
  ]
}
```

Supported ABI-like types: `string`, `bool`, `u32`, `i32`, `u64`, `i64`, `address`, `bytes`, `vec` with `element`, `map` with `key` and `value`, `struct` with named typed `fields`, and `enum` with `variants`. Complex values are edited as JSON. Scenario data is saved in browser localStorage only; it is not workspace-scoped or shared. The editor exports deterministic scenario JSON, a TypeScript fixture, and an API request example. Execution and campaign attachment are intentionally not enabled until server-side permissions, durable persistence, RPC simulation, and audit logging are integrated.

## Endpoints

- `GET /api/contracts/spec`: bundled demo spec and scope note.
- `POST /api/contracts/spec`: validates and echoes a JSON interface.
- `POST /api/invocations/simulate`: validates scenario input against the bundled demo spec and returns conservative illustrative estimates; no execution occurs.
