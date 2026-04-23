#!/usr/bin/env bash
# scripts/test-detect-duplicates.sh - Test for detect-duplicates.sh

set -euo pipefail

# Try to find python in common Windows paths if not in PATH
 if ! command -v python &>/dev/null && ! command -v python3 &>/dev/null; then
   export PATH="$PATH:/mnt/c/Users/DELL/AppData/Local/Programs/Python/Python313"
 fi

TEST_TSV="ops/test-duplicates.tsv"

cleanup() {
  rm -f "$TEST_TSV"
}
trap cleanup EXIT

echo "Creating test backlog with duplicates..."
cat <<EOF > "$TEST_TSV"
title|complexity|area|type|summary|acceptance|status|issue_number
Implement seed schema validator|trivial|area:fuzzer|type:task|Validate incoming seed payloads.|Reject malformed fields.||
Implement Seed Schema Validation|trivial|area:fuzzer|type:task|Validate incoming seed payloads.|Reject malformed fields.||
Unrelated Task|medium|area:web|type:feature|Build dashboard table.|Table supports pagination.||
EOF

echo "Running audit (internal check only)..."
# We expect this to fail (exit 1) because it should find the duplicate
if bash scripts/detect-duplicates.sh --local "$TEST_TSV" --no-remote; then
  echo "FAIL: Duplicate was NOT detected."
  exit 1
else
  echo "PASS: Duplicate detected as expected."
fi

echo "Running audit on healthy backlog..."
cat <<EOF > "$TEST_TSV"
title|complexity|area|type|summary|acceptance|status|issue_number
Implement seed schema validator|trivial|area:fuzzer|type:task|Summary A.|Acceptance A.||
Add deterministic PRNG adapter|medium|area:web|type:feature|Summary B.|Acceptance B.||
EOF

if bash scripts/detect-duplicates.sh --local "$TEST_TSV" --no-remote; then
  echo "PASS: No false positives in healthy backlog."
else
  echo "FAIL: False positive detected."
  exit 1
fi

echo "Checking bash syntax..."
bash -n scripts/detect-duplicates.sh
echo "PASS: Syntax check passed."

echo "All tests passed for detect-duplicates.sh!"
