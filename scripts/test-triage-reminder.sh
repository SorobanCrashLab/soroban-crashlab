#!/usr/bin/env bash
# scripts/test-triage-reminder.sh - Mock test for triage reminder script.

set -euo pipefail

# Create a mock gh script in the current directory
cat > ./gh_mock << 'EOF'
#!/usr/bin/env bash
case "$*" in
  "auth status"*)
    exit 0
    ;;
  "issue list"*"--label wave3"*)
    # Use python to generate dynamic dates
    python -c '
from datetime import datetime, timedelta
import json
ts_stale = (datetime.now() - timedelta(days=10)).isoformat() + "Z"
ts_fresh = (datetime.now() - timedelta(days=1)).isoformat() + "Z"
issues = [
    {"number": 1, "title": "Missing Complexity", "labels": [{"name": "wave3"}, {"name": "area:fuzzer"}], "assignees": [], "updatedAt": ts_fresh},
    {"number": 2, "title": "Missing Area", "labels": [{"name": "wave3"}, {"name": "complexity:medium"}], "assignees": [], "updatedAt": ts_fresh},
    {"number": 3, "title": "Unassigned High", "labels": [{"name": "wave3"}, {"name": "complexity:high"}, {"name": "area:web"}], "assignees": [], "updatedAt": ts_fresh},
    {"number": 4, "title": "Stale Blocked", "labels": [{"name": "wave3"}, {"name": "complexity:medium"}, {"name": "area:ops"}, {"name": "blocked"}], "assignees": [], "updatedAt": ts_stale},
    {"number": 5, "title": "Healthy Assigned", "labels": [{"name": "wave3"}, {"name": "complexity:trivial"}, {"name": "area:docs"}], "assignees": [{"login": "user1"}], "updatedAt": ts_fresh}
]
print(json.dumps(issues))
'
    ;;
  *)
    exit 1
    ;;
esac
EOF
chmod +x ./gh_mock

# Export PATH to include the mock
export PATH=".:$PATH"
# Alias gh to gh_mock for this session
alias gh='./gh_mock'

# Find python
if command -v python3 &>/dev/null; then
  export PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
  export PYTHON_CMD="python"
else
  # Try Windows path if in bash on Windows
  export PYTHON_CMD="python.exe"
fi

echo "Running triage-reminder.sh with mock issues..."
# We use a subshell to ensure the alias/path works and we can capture output
# Since aliases dont work in scripts usually, we will just name it 'gh'
mv ./gh_mock ./gh
output=$(bash scripts/triage-reminder.sh 2>&1 || true)
rm ./gh

echo "--- OUTPUT START ---"
echo "$output"
echo "--- OUTPUT END ---"

# Verify Snapshot Counts
echo "Verifying snapshots..."
if echo "$output" | grep -q "complexity:high: 1"; then echo "PASS: complexity:high count correct"; else echo "FAIL: complexity:high count incorrect"; exit 1; fi
if echo "$output" | grep -q "area:fuzzer: 1"; then echo "PASS: area:fuzzer count correct"; else echo "FAIL: area:fuzzer count incorrect"; exit 1; fi
if echo "$output" | grep -q "Total Open: 5"; then echo "PASS: Total Open count correct"; else echo "FAIL: Total Open count incorrect"; exit 1; fi

# Verify High-Priority Actions
echo "Verifying high-priority actions..."
if echo "$output" | grep -q "#1 Missing Complexity (missing metadata)"; then echo "PASS: Missing complexity detected"; else echo "FAIL: Missing complexity not detected"; exit 1; fi
if echo "$output" | grep -q "#2 Missing Area (missing metadata)"; then echo "PASS: Missing area detected"; else echo "FAIL: Missing area not detected"; exit 1; fi
if echo "$output" | grep -q "#3 Unassigned High (unassigned high complexity)"; then echo "PASS: Unassigned high complexity detected"; else echo "FAIL: Unassigned high complexity not detected"; exit 1; fi
if echo "$output" | grep -q "#4 Stale Blocked (stale blocked since"; then echo "PASS: Stale blocked detected"; else echo "FAIL: Stale blocked not detected"; exit 1; fi

echo "All tests passed!"
