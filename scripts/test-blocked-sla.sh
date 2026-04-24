#!/usr/bin/env bash
# scripts/test-blocked-sla.sh - Mock test for blocked PR escalation SLA.

set -euo pipefail

# Add current scripts directory to PATH so our mock 'gh' is used
export PATH="$(pwd)/scripts:$PATH"
chmod +x scripts/gh

echo "Running SLA check with mock blocked PR..."
# Run the script and capture output
output=$(bash scripts/check-sla.sh 2>&1 || true)

echo "--- OUTPUT START ---"
echo "$output"
echo "--- OUTPUT END ---"

# Verify that the blocked PR was detected
if echo "$output" | grep -q "PR #123"; then
  echo "PASS: Blocked PR #123 detected."
else
  echo "FAIL: Blocked PR #123 not detected."
  exit 1
fi

# Verify that the escalation template was printed
if echo "$output" | grep -q "Escalation Template:"; then
  echo "PASS: Escalation template printed."
else
  echo "FAIL: Escalation template not printed."
  exit 1
fi

# Verify that the script exited with error (since there's a breach)
if echo "$output" | grep -q "SLA check FAILED"; then
  echo "PASS: SLA check failed as expected."
else
  echo "FAIL: SLA check should have failed."
  exit 1
fi

echo "All tests passed!"
