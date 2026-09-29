/**
 * Utilities for generating run failure reproduction snippets
 */

import type { FuzzingRun } from "./types";

export type SnippetLanguage = "rust" | "typescript" | "bash" | "python";

export function generateReproductionSnippet(
  run: FuzzingRun,
  language: SnippetLanguage,
): string {
  if (!run.crashDetail) {
    return "// No crash details available for this run";
  }

  switch (language) {
    case "rust":
      return generateRustSnippet(run);
    case "typescript":
      return generateTypeScriptSnippet(run);
    case "bash":
      return generateBashSnippet(run);
    case "python":
      return generatePythonSnippet(run);
    default:
      return "";
  }
}

function generateRustSnippet(run: FuzzingRun): string {
  const { crashDetail } = run;
  if (!crashDetail) return "";

  let payload;
  try {
    payload = JSON.parse(crashDetail.payload);
  } catch {
    payload = {};
  }

  return `// Reproduction snippet for ${run.id}
// Failure: ${crashDetail.failureCategory}
// Signature: ${crashDetail.signature}

use soroban_sdk::{Env, IntoVal};

#[test]
fn reproduce_${run.id.replace(/-/g, "_")}() {
    let env = Env::default();
    
    // Contract setup
    let contract_id = env.register_contract(None, ${payload.contract || "YourContract"});
    let client = ${payload.contract || "YourContract"}Client::new(&env, &contract_id);
    
    // Reproduce the failing scenario
    ${payload.method ? `let result = client.${payload.method}(` : "// Call the method that triggered the failure"}
        ${
          payload.args
            ? Object.entries(payload.args)
                .map(
                  ([key, value]) =>
                    `&${JSON.stringify(value)}.into_val(&env),  // ${key}`,
                )
                .join("\n        ")
            : "// Add your arguments here"
        }
    ${payload.method ? ");" : ""}
    
    // Expected failure: ${crashDetail.failureCategory}
    // This should panic or return an error
    
    // Debug information:
    // - Run ID: ${run.id}
    // - Seeds processed: ${run.seedCount}
    // - CPU instructions: ${run.cpuInstructions}
    // - Memory bytes: ${run.memoryBytes}
}`;
}

function generateTypeScriptSnippet(run: FuzzingRun): string {
  const { crashDetail } = run;
  if (!crashDetail) return "";

  let payload;
  try {
    payload = JSON.parse(crashDetail.payload);
  } catch {
    payload = {};
  }

  return `// Reproduction snippet for ${run.id}
// Failure: ${crashDetail.failureCategory}
// Signature: ${crashDetail.signature}

import { Contract, SorobanRpc, xdr } from '@stellar/stellar-sdk';

async function reproduce_${run.id.replace(/-/g, "_")}() {
  // Setup RPC connection
  const server = new SorobanRpc.Server('https://soroban-testnet.stellar.org');
  
  // Contract configuration
  const contractId = '${payload.contract || "YOUR_CONTRACT_ID"}';
  const contract = new Contract(contractId);
  
  ${
    payload.method
      ? `// Invoke the failing method
  const operation = contract.call(
    '${payload.method}',
    ${
      payload.args
        ? Object.entries(payload.args)
            .map(
              ([key, value]) => `xdr.ScVal.scvString('${value}'),  // ${key}`,
            )
            .join("\n    ")
        : "// Add your arguments here"
    }
  );
  
  try {
    const result = await server.simulateTransaction(operation);
    console.log('Result:', result);
  } catch (error) {
    console.error('Expected failure:', error);
    // Failure category: ${crashDetail.failureCategory}
  }`
      : `// Call the method that triggered the failure`
  }
  
  // Debug information:
  console.log({
    runId: '${run.id}',
    seedCount: ${run.seedCount},
    cpuInstructions: ${run.cpuInstructions},
    memoryBytes: ${run.memoryBytes},
    signature: '${crashDetail.signature}'
  });
}

reproduce_${run.id.replace(/-/g, "_")}();`;
}

function generatePythonSnippet(run: FuzzingRun): string {
  const { crashDetail } = run;
  if (!crashDetail) return "";

  let payload;
  try {
    payload = JSON.parse(crashDetail.payload);
  } catch {
    payload = {};
  }

  return `#!/usr/bin/env python3
# Reproduction snippet for ${run.id}
# Failure: ${crashDetail.failureCategory}
# Signature: ${crashDetail.signature}

import sys

from stellar_sdk import Contract, SorobanRpc, xdr

RPC_URL = "https://soroban-testnet.stellar.org"
CONTRACT_ID = "${payload.contract || 'YOUR_CONTRACT_ID'}"


def reproduce_${run.id.replace(/-/g, "_")}() -> int:
    server = SorobanRpc(RPC_URL)
    contract = Contract(CONTRACT_ID)

${
  payload.method
    ? `    # Invoke the failing method
    operation = contract.call(
        "${payload.method}",
        [
${
  payload.args
    ? Object.entries(payload.args)
        .map(
          ([key, value]) => `            xdr.ScVal.scvString("${value}"),  # ${key}`,
        )
        .join("\n")
    : "            # Add your arguments here"
}
        ],
    )

    try:
        result = server.simulate_transaction(operation)
        print("Result:", result)
    except Exception as error:
        print(f"Expected failure: {error}")
        # Failure category: ${crashDetail.failureCategory}`
    : `    # Call the method that triggered the failure`
}

    # Debug information
    print({
        "runId": "${run.id}",
        "seedCount": ${run.seedCount},
        "cpuInstructions": ${run.cpuInstructions},
        "memoryBytes": ${run.memoryBytes},
        "signature": "${crashDetail.signature}",
    })
    return 0


if __name__ == "__main__":
    sys.exit(reproduce_${run.id.replace(/-/g, "_")}())`;
}

function generateBashSnippet(run: FuzzingRun): string {
  const { crashDetail } = run;
  if (!crashDetail) return "";

  let payload;
  try {
    payload = JSON.parse(crashDetail.payload);
  } catch {
    payload = {};
  }

  return `#!/bin/bash
# Reproduction script for ${run.id}
# Failure: ${crashDetail.failureCategory}
# Signature: ${crashDetail.signature}

set -e

echo "=== Reproducing failure from ${run.id} ==="

# Environment setup
export RUN_ID="${run.id}"
export FAILURE_CATEGORY="${crashDetail.failureCategory}"
export SIGNATURE="${crashDetail.signature}"

# Contract details
CONTRACT="${payload.contract || "YOUR_CONTRACT"}"
METHOD="${payload.method || "YOUR_METHOD"}"

${
  crashDetail.replayAction
    ? `# Replay command from crash detail
${crashDetail.replayAction}`
    : `# Run the fuzzing command
cargo run --bin crashlab-core -- \\
  --contract "$CONTRACT" \\
  --method "$METHOD" \\
  --seed-count ${run.seedCount} \\
  --verbose`
}

# Debug information
echo ""
echo "Debug Info:"
echo "  - CPU Instructions: ${run.cpuInstructions}"
echo "  - Memory Bytes: ${run.memoryBytes}"
echo "  - Min Resource Fee: ${run.minResourceFee}"
echo "  - Duration: ${run.duration}ms"
echo ""
echo "Expected failure: ${crashDetail.failureCategory}"
echo "Signature: ${crashDetail.signature}"`;
}

export function escapeCode(code: string): string {
  return code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
