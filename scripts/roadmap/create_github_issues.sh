#!/usr/bin/env bash
set -euo pipefail

# Bulk-create GitHub issues for roadmap entries.
# Reads a TSV file (tab-separated) with header and these columns:
# title<TAB>body<TAB>labels(comma-separated)<TAB>milestone(optional)
# Example row:
# "Add run cancellation command"\t"Implements run cancellation"\t"area:contracts,priority:p0"\t"Roadmap Wave 4"

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ISSUE_FILE="${1:-$ROOT_DIR/ops/roadmap-issues.tsv}"
REPO="${2:-SorobanCrashLab/soroban-crashlab}"

# CLI behavior flags
DRY_RUN=0
VERBOSE=0

usage() {
  cat <<EOF
Usage: $0 [ISSUE_TSV] [owner/repo]

Environment:
  GH_TOKEN or GITHUB_TOKEN may be used when gh CLI is not available or unauthenticated.

Options:
  --noop, --dry-run   Print actions without creating issues
  --verbose           Print additional debug output

ISSUE_TSV format (tab-separated):
  title<TAB>body<TAB>labels(comma-separated)<TAB>milestone

This script is idempotent: it will skip issues where an open issue with the same title already exists.
EOF
  exit 1
}

# Simple arg parsing
while [[ ${1:-} =~ ^- ]]; do
  case "$1" in
    --noop|--dry-run)
      DRY_RUN=1; shift;;
    --verbose)
      VERBOSE=1; shift;;
    -h|--help)
      usage;;
    *)
      break;;
  esac
done

if [ ! -f "$ISSUE_FILE" ]; then
  echo "Issue file not found: $ISSUE_FILE" >&2
  usage
fi

have_gh=0
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    have_gh=1
  fi
fi

token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

# Wrapper to call GitHub API using gh if available, else curl
api_call() {
  local method="$1" endpoint="$2" data="${3:-}"

  if [ "$have_gh" -eq 1 ]; then
    if [ -n "$data" ]; then
      printf '%s' "$data" | gh api --method "$method" "$endpoint" --input -
    else
      gh api --method "$method" "$endpoint"
    fi
    return
  fi

  if [ -z "$token" ]; then
    echo "No authenticated publisher available. Install gh and authenticate, or set GH_TOKEN/GITHUB_TOKEN." >&2
    exit 1
  fi

  if [ -n "$data" ]; then
    curl -sS -X "$method" \
      -H "Authorization: Bearer $token" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com$endpoint" \
      -d "$data"
  else
    curl -sS -X "$method" \
      -H "Authorization: Bearer $token" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com$endpoint"
  fi
}

# Finds milestone number by title (returns empty when not found)
get_milestone_number() {
  local milestone_title="$1"
  if [ -z "$milestone_title" ]; then
    echo ""
    return
  fi

  local resp
  resp="$(api_call GET "/repos/$REPO/milestones?state=all")"
  # use jq if available for robust parsing; fall back to grep/awk
  if command -v jq >/dev/null 2>&1; then
    echo "$resp" | jq -r --arg M "$milestone_title" '.[] | select(.title == $M) | .number' | head -n1 || true
  else
    echo "$resp" | awk -vRS='},\n' '/"title"/ { if (index($0, "\"title\": \"'"""'"""'" ) ) print $0 }' >/dev/null 2>&1 || true
    # Fallback simple grep: not bulletproof but acceptable for small repos
    echo "$resp" | grep -E '"title"|"number"' | sed -e 's/^[[:space:]]*//' | paste - - | grep "\"$milestone_title\"" | head -n1 | sed -E 's/.*"number": *([0-9]+).*/\1/' || true
  fi
}

# Check if issue exists by exact title match among open issues
issue_exists() {
  local title="${1}"
  if [ "$have_gh" -eq 1 ]; then
    # gh issue list --search supports searching in title
    count=$(gh issue list --repo "$REPO" --search "\"$title\" in:title is:open" --limit 100 --json title --jq '.[].title' 2>/dev/null | grep -Fxc "$title" || true)
    echo "$count"
    return
  fi

  # Fallback via search API
  local encoded
  encoded=$(printf '%s' "$title" | python3 -c 'import sys,urllib.parse as u; print(u.quote(sys.stdin.read().strip()))')
  local resp
  resp=$(api_call GET "/search/issues?q=repo:$REPO+is:issue+state:open+in:title+\"$encoded\"&per_page=5")
  echo "$resp" | grep -Fxc "\"title\": \"$title\"" || true
}

json_escape() {
  python3 - <<'PY'
import sys,json
s=sys.stdin.read()
print(json.dumps(s)[1:-1])
PY
}

if [ "$VERBOSE" -eq 1 ]; then
  echo "Using REPO=$REPO" >&2
  echo "ISSUE_FILE=$ISSUE_FILE" >&2
  echo "have_gh=$have_gh" >&2
fi

echo "Processing issues from $ISSUE_FILE"

# Skip header line if present: detect header by existence of 'title' in first line
tail -n +1 "$ISSUE_FILE" | awk 'NR==1{print; exit}' | grep -iq "title" && START=2 || START=1

# Read TSV; use awk to handle tabs reliably
awk -v start="$START" 'BEGIN{FS="\t"} NR>=start{print NR; print $0}' "$ISSUE_FILE" >/tmp/roadmap_issues_lines.$$ || true

# Iterate lines robustly
while IFS=$'\t' read -r lineno title body labels milestone; do
  # Skip empty titles
  title="$(echo "$title" | sed 's/^\s\+//;s/\s\+$//')"
  [ -z "$title" ] && continue

  if [ "$VERBOSE" -eq 1 ]; then
    echo "Line $lineno: title='$title'" >&2
  fi

  # Idempotency check
  exists=$(issue_exists "$title")
  if [ "${exists:-0}" -gt 0 ]; then
    echo "Skipping existing issue: $title"
    continue
  fi

  # Resolve milestone number if provided
  milestone_num=""
  if [ -n "${milestone:-}" ]; then
    milestone_num="$(get_milestone_number "$milestone" || true)"
    if [ -n "$milestone_num" ]; then
      if [ "$VERBOSE" -eq 1 ]; then
        echo "Resolved milestone '$milestone' -> #$milestone_num" >&2
      fi
    else
      if [ "$VERBOSE" -eq 1 ]; then
        echo "Milestone '$milestone' not found; will create issue without milestone" >&2
      fi
    fi
  fi

  # Prepare labels JSON array
  IFS=',' read -r -a label_arr <<<"${labels:-}"
  labels_json='[]'
  if [ -n "${labels:-}" ]; then
    labels_json=$(printf '%s\n' "${label_arr[@]}" | python3 - <<'PY'
import sys, json
arr=[l.strip() for l in sys.stdin.read().splitlines() if l.strip()]
print(json.dumps(arr))
PY
)
  fi

  # Build payload
  title_json=$(printf '%s' "$title" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')
  body_json=$(printf '%s' "$body" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')

  payload=$(python3 - <<PY
import json
payload={
  'title': json.loads($title_json),
  'body': json.loads($body_json),
}
labels=%s
if labels:
    payload['labels']=labels
if '%s':
    # milestone expects an integer number
    payload['milestone']=%s
print(json.dumps(payload))
PY
  )

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[DRY RUN] Would create issue: $title"
    echo "Payload: $payload"
    continue
  fi

  # Create issue
  if [ "$have_gh" -eq 1 ]; then
    # Use gh for comfortable UX
    cmd=(gh issue create --repo "$REPO" --title "$title" --body "$body")
    if [ -n "${labels:-}" ]; then
      for L in "${label_arr[@]}"; do
        cmd+=(--label "${L}")
      done
    fi
    if [ -n "$milestone_num" ]; then
      cmd+=(--milestone "$milestone_num")
    fi

    if [ "$VERBOSE" -eq 1 ]; then
      echo "Running: ${cmd[*]}" >&2
    fi

    "${cmd[@]}"
  else
    api_call POST "/repos/$REPO/issues" "$payload" >/dev/null
  fi

  echo "Created issue: $title"

done < <(tail -n +$START "$ISSUE_FILE")

rm -f /tmp/roadmap_issues_lines.$$ || true

echo "Done."
