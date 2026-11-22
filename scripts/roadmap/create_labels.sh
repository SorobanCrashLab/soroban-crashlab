#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPO="SorobanCrashLab/soroban-crashlab"
LABEL_FILE=""
DRY_RUN=0
VERBOSE=0

usage() {
  cat <<EOF
Usage: $0 [--repo owner/name] [--file labels.tsv] [--dry-run] [--verbose]

Create or update GitHub labels in an idempotent way.

Input file format (TSV):
  name<TAB>color<TAB>description

If no file is provided, the script uses the built-in roadmap label set.
EOF
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --file)
      LABEL_FILE="${2:-}"
      shift 2
      ;;
    --dry-run|--noop)
      DRY_RUN=1
      shift
      ;;
    --verbose)
      VERBOSE=1
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      ;;
  esac
done

if [ -z "$REPO" ]; then
  echo "--repo cannot be empty" >&2
  exit 1
fi

have_gh=0
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  have_gh=1
fi

token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

if [ "$have_gh" -eq 0 ] && [ -z "$token" ] && [ "$DRY_RUN" -ne 1 ]; then
  echo "No authenticated publisher available. Install gh and authenticate, or set GH_TOKEN/GITHUB_TOKEN." >&2
  exit 1
fi

api_call() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"

  if [ -n "$token" ]; then
    if [ -n "$data" ]; then
      curl -sS --retry 3 --retry-delay 1 --retry-all-errors -X "$method" \
        -H "Authorization: Bearer $token" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com$endpoint" \
        -d "$data"
    else
      curl -sS --retry 3 --retry-delay 1 --retry-all-errors -X "$method" \
        -H "Authorization: Bearer $token" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com$endpoint"
    fi
    return
  fi

  if [ -n "$data" ]; then
    gh api --method "$method" "$endpoint" --input - <<<"$data"
  else
    gh api --method "$method" "$endpoint"
  fi
}

load_labels() {
  if [ -n "$LABEL_FILE" ]; then
    if [ ! -f "$LABEL_FILE" ]; then
      echo "Label file not found: $LABEL_FILE" >&2
      exit 1
    fi
    cat "$LABEL_FILE"
    return
  fi

  cat <<'EOF'
wave3	1f6feb	Stellar Wave 3 issue backlog
Stellar Wave	5319e7	Wave participation tracking
complexity:trivial	c2e0c6	Wave trivial complexity
complexity:medium	fbca04	Wave medium complexity
complexity:high	d93f0b	Wave high complexity
area:fuzzer	0052cc	Fuzzer engine
area:runtime	0e8a16	Runtime and replay
area:generator	5319e7	Test generation and fixtures
area:web	1d76db	Frontend dashboard
area:docs	0075ca	Documentation
area:ops	8250df	Maintainer operations
area:security	b60205	Security policies
type:task	d4c5f9	Engineering task
type:feature	a2eeef	Feature work
blocked	d93f0b	Blocked on dependency or external factor
stale	ededed	No contributor response within SLA window
EOF
}

label_exists() {
  local name="$1"

  if [ "$have_gh" -eq 1 ]; then
    if gh api "repos/$REPO/labels?per_page=100" --paginate | python3 - "$name" <<'PY'
import json
import sys

needle = sys.argv[1]
labels = []
for chunk in sys.stdin.read().splitlines():
    if not chunk.strip():
        continue
    try:
        labels.extend(json.loads(chunk))
    except json.JSONDecodeError:
        pass

sys.exit(0 if any(label.get('name') == needle for label in labels) else 1)
PY
    then
      return 0
    fi
    return 1
  fi

  local response
  response="$(api_call GET "/repos/$REPO/labels?per_page=100")"
  printf '%s' "$response" | python3 - "$name" <<'PY'
import json
import sys

needle = sys.argv[1]
labels = json.load(sys.stdin)
sys.exit(0 if any(label.get('name') == needle for label in labels) else 1)
PY
}

upsert_label() {
  local name="$1"
  local color="$2"
  local description="$3"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] upsert label: $name ($color) - $description"
    return
  fi

  local payload
  payload="$(python3 - "$name" "$color" "$description" <<'PY'
import json
import sys

name, color, description = sys.argv[1:4]
print(json.dumps({
    'name': name,
    'color': color,
    'description': description,
}))
PY
)"

  if label_exists "$name"; then
    local encoded_name
    encoded_name="$(python3 - "$name" <<'PY'
import sys
from urllib.parse import quote

print(quote(sys.argv[1], safe=''))
PY
)"
    api_call PATCH "/repos/$REPO/labels/$encoded_name" "$payload" >/dev/null
    echo "Updated label: $name"
  else
    api_call POST "/repos/$REPO/labels" "$payload" >/dev/null
    echo "Created label: $name"
  fi
}

if [ "$VERBOSE" -eq 1 ]; then
  echo "Using REPO=$REPO" >&2
  if [ -n "$LABEL_FILE" ]; then
    echo "LABEL_FILE=$LABEL_FILE" >&2
  fi
  echo "have_gh=$have_gh" >&2
fi

echo "Bootstrapping labels for $REPO"

while IFS=$'\t' read -r name color description; do
  [ -z "${name:-}" ] && continue
  [ "${name#\#}" != "$name" ] && continue
  upsert_label "$name" "$color" "$description"
done < <(load_labels)

echo "Label bootstrap complete."
