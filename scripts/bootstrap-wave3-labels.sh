#!/usr/bin/env bash
set -euo pipefail

REPO="SorobanCrashLab/soroban-crashlab"
DRY_RUN=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--repo owner/name] [--dry-run]" >&2
      exit 1
      ;;
  esac
done

if [ -z "$REPO" ]; then
  echo "--repo cannot be empty" >&2
  exit 1
fi

have_gh=0
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    have_gh=1
  fi
fi

token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

if [ "$have_gh" -eq 0 ] && [ -z "$token" ]; then
  echo "No authenticated publisher available. Install gh and auth, or set GH_TOKEN/GITHUB_TOKEN." >&2
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

upsert_label() {
  local name="$1"
  local color="$2"
  local desc="$3"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] upsert label: $name ($color) - $desc"
    return
  fi

  if [ "$have_gh" -eq 1 ]; then
    if gh label list --repo "$REPO" --limit 200 --search "$name" --json name --jq '.[].name' | grep -Fqx "$name"; then
      gh label edit "$name" --repo "$REPO" --color "$color" --description "$desc" >/dev/null
      echo "Updated label: $name"
    else
      gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" >/dev/null
      echo "Created label: $name"
    fi
    return
  fi

  local payload
  payload=$(printf '{"name":"%s","color":"%s","description":"%s"}' "$name" "$color" "$desc")
  if api_call POST "/repos/$REPO/labels" "$payload" >/dev/null 2>&1; then
    echo "Created label: $name"
  else
    if api_call PATCH "/repos/$REPO/labels/$name" "$payload" >/dev/null 2>&1; then
      echo "Updated label: $name"
    else
      echo "Failed to upsert label: $name" >&2
      exit 1
    fi
  fi
}

echo "Bootstrapping standard Wave labels for $REPO"

upsert_label "wave3" "1f6feb" "Stellar Wave 3 issue backlog"
upsert_label "Stellar Wave" "5319e7" "Wave participation tracking"
upsert_label "complexity:trivial" "c2e0c6" "Wave trivial complexity"
upsert_label "complexity:medium" "fbca04" "Wave medium complexity"
upsert_label "complexity:high" "d93f0b" "Wave high complexity"
upsert_label "area:fuzzer" "0052cc" "Fuzzer engine"
upsert_label "area:runtime" "0e8a16" "Runtime and replay"
upsert_label "area:generator" "5319e7" "Test generation and fixtures"
upsert_label "area:web" "1d76db" "Frontend dashboard"
upsert_label "area:docs" "0075ca" "Documentation"
upsert_label "area:ops" "8250df" "Maintainer operations"
upsert_label "area:security" "b60205" "Security policies"
upsert_label "type:task" "d4c5f9" "Engineering task"
upsert_label "type:feature" "a2eeef" "Feature work"
upsert_label "blocked" "d93f0b" "Blocked on dependency or external factor"
upsert_label "stale" "ededed" "No contributor response within SLA window"

echo "Label bootstrap complete."
