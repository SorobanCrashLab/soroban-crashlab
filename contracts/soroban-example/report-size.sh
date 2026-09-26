#!/usr/bin/env bash
set -euo pipefail

# Report and enforce WASM size budget for soroban-example contract.
# Documented budget: 11,000 bytes (~20% headroom over baseline 9,112 bytes).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WASM_PATH="${1:-$SCRIPT_DIR/target/wasm32-unknown-unknown/release/soroban_example.wasm}"
REPORT_PATH="${2:-$SCRIPT_DIR/target/wasm-size-report.md}"

BASELINE_BYTES=9112
BUDGET_BYTES="${WASM_SIZE_BUDGET:-11000}"

if [ ! -f "$WASM_PATH" ]; then
  echo "::error::WASM file not found at $WASM_PATH. Run 'cargo build --target wasm32-unknown-unknown --release' first."
  exit 1
fi

SIZE=$(wc -c < "$WASM_PATH" | tr -d ' ')

# Format sizes in KB
to_kb() {
  awk "BEGIN {printf \"%.2f KB\", $1 / 1024}"
}

SIZE_KB=$(to_kb "$SIZE")
BUDGET_KB=$(to_kb "$BUDGET_BYTES")
BASELINE_KB=$(to_kb "$BASELINE_BYTES")

DELTA=$((SIZE - BASELINE_BYTES))
PERCENT_BUDGET=$(awk "BEGIN {printf \"%.1f%%\", ($SIZE / $BUDGET_BYTES) * 100}")

if [ "$DELTA" -gt 0 ]; then
  DELTA_STR="+$DELTA B"
elif [ "$DELTA" -lt 0 ]; then
  DELTA_STR="$DELTA B"
else
  DELTA_STR="0 B (no change)"
fi

mkdir -p "$(dirname "$REPORT_PATH")"

if [ "$SIZE" -gt "$BUDGET_BYTES" ]; then
  STATUS="❌ **FAILED** ($PERCENT_BUDGET of budget)"
  OVERAGE=$((SIZE - BUDGET_BYTES))
  OVERAGE_KB=$(to_kb "$OVERAGE")
  cat <<EOF > "$REPORT_PATH"
### 📦 Soroban Contract WASM Size Report

| Contract | Artifact | Current Size | Budget Limit | Delta vs Baseline | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| \`soroban-example\` | \`soroban_example.wasm\` | **$SIZE B** ($SIZE_KB) | **$BUDGET_BYTES B** ($BUDGET_KB) | $DELTA_STR | $STATUS |

> ⚠️ **Budget Exceeded**: The artifact size exceeds the documented limit by **$OVERAGE B** ($OVERAGE_KB). Please optimize dependencies or contract code before merging.
EOF

  echo "::error::WASM contract size ($SIZE B / $SIZE_KB) exceeds budget limit of $BUDGET_BYTES B ($BUDGET_KB) by $OVERAGE B ($OVERAGE_KB)!"
  cat "$REPORT_PATH"
  exit 1
else
  STATUS="✅ **PASSED** ($PERCENT_BUDGET of budget)"
  cat <<EOF > "$REPORT_PATH"
### 📦 Soroban Contract WASM Size Report

| Contract | Artifact | Current Size | Budget Limit | Delta vs Baseline | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| \`soroban-example\` | \`soroban_example.wasm\` | **$SIZE B** ($SIZE_KB) | **$BUDGET_BYTES B** ($BUDGET_KB) | $DELTA_STR | $STATUS |

> ℹ️ **Size Budget**: Documented budget is $BUDGET_BYTES B ($BUDGET_KB) (~20% headroom over $BASELINE_BYTES B baseline).
EOF

  echo "WASM contract size check passed: $SIZE B ($SIZE_KB) <= $BUDGET_BYTES B ($BUDGET_KB) [$PERCENT_BUDGET]"
  cat "$REPORT_PATH"
  exit 0
fi
