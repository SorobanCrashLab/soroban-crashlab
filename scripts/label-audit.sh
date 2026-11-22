#!/usr/bin/env bash
# label-audit.sh - Flag Wave issues that are missing required labels or that
# still carry deprecated labels.
#
# The authoritative taxonomy lives in docs/LABEL_TAXONOMY.md. This check is a
# warning by default (exit 0) so it can run as an optional CI step; pass
# --strict to exit 1 when any issue is missing required labels.
#
# Requirements: gh CLI authenticated, or GH_TOKEN / GITHUB_TOKEN set. jq is used
# when available for parsing; without jq the script falls back to a slower path.
#
# Usage:
#   bash scripts/label-audit.sh [--repo OWNER/REPO] [--strict]
#
# Environment:
#   REPO   Override the default repository (SorobanCrashLab/soroban-crashlab)

set -euo pipefail

REPO="${REPO:-SorobanCrashLab/soroban-crashlab}"
STRICT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    --strict) STRICT=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$REPO" ]]; then
  echo "Error: --repo cannot be empty." >&2
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI is not installed." >&2
  exit 2
fi

if [[ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]] && ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run 'gh auth login' or set GH_TOKEN." >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required for label-audit." >&2
  exit 2
fi

# Deprecated labels being retired (see docs/LABEL_TAXONOMY.md). `security`,
# `pinned`, `backlog`, and `dependencies` are intentionally NOT here: the stale
# workflow exemption depends on their exact names.
DEPRECATED_RE='^(high|medium|trivial|priority:|severity:|stack:|touch:|area:dx)'

issues_json="$(gh issue list -R "$REPO" -s open -L 500 --json number,title,labels)"

missing_json="$(printf '%s' "$issues_json" | jq -r '
  [ .[]
    | select(any(.labels[]?; .name == "wave4"))
    | {
        number,
        title,
        has_complexity: (any(.labels[]?; .name | startswith("complexity:"))),
        has_area: (any(.labels[]?; .name | startswith("area:")))
      }
    | select((.has_complexity and .has_area) | not)
    | "#\(.number) \(.title)"
  ] | .[]')"

deprecated_json="$(printf '%s' "$issues_json" | jq -r --arg re "$DEPRECATED_RE" '
  [ .[]
    | . as $issue
    | ([ .labels[]?.name | select(test($re)) ]) as $bad
    | select(($bad | length) > 0)
    | "#\(.number) \(.title): \($bad | join(", "))"
  ] | .[]')"

echo "Label audit - ${REPO}"
echo ""

echo "==> wave4 issues missing a required label (complexity:* and area:*)"
if [[ -z "$missing_json" ]]; then
  echo "    (none)"
else
  printf '    %s\n' "$missing_json"
fi
echo ""

echo "==> issues carrying deprecated labels"
if [[ -z "$deprecated_json" ]]; then
  echo "    (none)"
else
  printf '    %s\n' "$deprecated_json"
fi
echo ""

missing_count=0
if [[ -n "$missing_json" ]]; then
  missing_count=$(printf '%s\n' "$missing_json" | wc -l | tr -d ' ')
fi

if [[ "$STRICT" -eq 1 && "$missing_count" -gt 0 ]]; then
  echo "FAIL: ${missing_count} wave4 issue(s) missing required labels." >&2
  exit 1
fi

echo "OK: audit complete (${missing_count} issue(s) missing required labels)."
