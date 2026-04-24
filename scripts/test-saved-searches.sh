#!/usr/bin/env bash
# scripts/test-saved-searches.sh - Test for saved-searches.sh

set -euo pipefail

echo "Running tests for scripts/saved-searches.sh..."

# 1. Basic execution
output=$(bash scripts/saved-searches.sh)

if echo "$output" | grep -q "### 🌊 Wave Triage Saved Searches: SorobanCrashLab/soroban-crashlab (wave3)"; then
  echo "PASS: Default repo and label detected."
else
  echo "FAIL: Default repo/label not found in output."
  exit 1
fi

if echo "$output" | grep -q "#### 🔍 Pending Review" && \
   echo "$output" | grep -q "#### 🔍 Stale" && \
   echo "$output" | grep -q "#### 🔍 Blocked"; then
  echo "PASS: All sections present."
else
  echo "FAIL: Missing sections in output."
  exit 1
fi

# 2. Repo override
output_repo=$(bash scripts/saved-searches.sh --repo MyOrg/MyRepo)
if echo "$output_repo" | grep -q "MyOrg/MyRepo"; then
  echo "PASS: Repo override detected."
else
  echo "FAIL: Repo override not reflected in output."
  exit 1
fi

# 3. Date calculation check (meaningful edge case)
# Check if the date format is YYYY-MM-DD
if echo "$output" | grep -qE "[0-9]{4}-[0-9]{2}-[0-9]{2}"; then
  echo "PASS: Date format is correct."
else
  echo "FAIL: Date format incorrect or missing."
  exit 1
fi

# 4. Check syntax
bash -n scripts/saved-searches.sh
echo "PASS: Syntax check passed."

echo "All tests passed for saved-searches.sh!"
