#!/bin/bash
set -e

# Build the soroban-example contract for wasm32 target
# This script builds the contract to a .wasm file that can be deployed to Soroban

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/../../contracts" && pwd)"
CONTRACT_DIR="$WORKSPACE_DIR/soroban-example"

echo "Building soroban-example contract for wasm32-unknown-unknown..."
cd "$WORKSPACE_DIR"

cargo build -p soroban-example --target wasm32-unknown-unknown --release

echo "Build complete!"
echo "WASM file location: $WORKSPACE_DIR/target/wasm32-unknown-unknown/release/soroban_example.wasm"
