#!/usr/bin/env bash
# Lists Wave-labelled open issues that match backlog stale thresholds.
# Cadence, owner, and criteria are documented in MAINTAINER_WAVE_PLAYBOOK.md.
#
# Requirements: gh CLI, jq. Authenticated gh or GH_TOKEN / GITHUB_TOKEN (e.g. Actions).
#
# Usage:
#   bash scripts/backlog-freshness-review.sh [--repo OWNER/REPO]
#
# Environment:
#   REPO                     Default SorobanCrashLab/soroban-crashlab
#   ASSIGNED_STALE_DAYS      Default 3
#   UNASSIGNED_STALE_DAYS    Default 14
#   STALE_LABEL_QUIET_DAYS   Default 7 (open issues still labelled stale)

set -euo pipefail

REPO="${REPO:-SorobanCrashLab/soroban-crashlab}"
ASSIGNED_STALE_DAYS="${ASSIGNED_STALE_DAYS:-3}"
UNASSIGNED_STALE_DAYS="${UNASSIGNED_STALE_DAYS:-14}"
STALE_LABEL_QUIET_DAYS="${STALE_LABEL_QUIET_DAYS:-7}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

iso_start_n_days_ago() {
  local days="$1"
  if date --version &>/dev/null 2>&1; then
    date -u -d "${days} days ago" +%Y-%m-%dT00:00:00Z
  else
    local d
    d=$(date -u -v-"${days}"d +%Y-%m-%d)
    echo "${d}T00:00:00Z"
  fi
}

if ! command -v gh &>/dev/null; then
  echo "Error: gh CLI is not installed." >&2
  exit 2
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is not installed." >&2
  exit 2
fi

if [[ -n "${GITHUB_TOKEN:-}" || -n "${GH_TOKEN:-}" ]]; then
  export GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
else
  if ! gh auth status &>/dev/null; then
    echo "Error: gh is not authenticated. Run 'gh auth login' or set GH_TOKEN." >&2
    exit 2
  fi
fi

assigned_cutoff=$(iso_start_n_days_ago "$ASSIGNED_STALE_DAYS")
unassigned_cutoff=$(iso_start_n_days_ago "$UNASSIGNED_STALE_DAYS")
stale_label_cutoff=$(iso_start_n_days_ago "$STALE_LABEL_QUIET_DAYS")

echo "Backlog freshness — ${REPO}"
echo "Thresholds: assigned+wave3 updated before ${assigned_cutoff} (${ASSIGNED_STALE_DAYS}d), unassigned+wave3 before ${unassigned_cutoff} (${UNASSIGNED_STALE_DAYS}d), wave3+stale before ${stale_label_cutoff} (${STALE_LABEL_QUIET_DAYS}d)."
echo ""

print_block() {
  local title="$1"
  local json="$2"
  echo "==> ${title}"
  local n
  n=$(echo "$json" | jq 'length')
  if [[ "$n" -eq 0 ]]; then
    echo "    (none)"
  else
    echo "$json" | jq -r '.[] | "    #\(.number) (\(.updatedAt[0:10])) \(.title)"'
  fi
  echo ""
}

assigned_json=$(
  gh issue list -R "$REPO" -s open -L 500 --assignee '*' \
    --json number,title,updatedAt,labels,assignees |
  jq --arg c "$assigned_cutoff" \
    '[.[] | select(([.labels[]?.name] | index("wave3")) != null)
            | select((.assignees | length) > 0)
            | select(.updatedAt < $c)
            | {number, title, updatedAt}]'
)

unassigned_json=$(
  gh issue list -R "$REPO" -s open -L 500 \
    --json number,title,updatedAt,labels,assignees |
  jq --arg c "$unassigned_cutoff" \
    '[.[] | select(([.labels[]?.name] | index("wave3")) != null)
            | select((.assignees | length) == 0)
            | select(.updatedAt < $c)
            | {number, title, updatedAt}]'
)

stale_label_json=$(
  gh issue list -R "$REPO" -s open -L 500 \
    --json number,title,updatedAt,labels |
  jq --arg c "$stale_label_cutoff" \
    '[.[] | select(([.labels[]?.name] | index("wave3")) != null)
            | select(([.labels[]?.name] | index("stale")) != null)
            | select(.updatedAt < $c)
            | {number, title, updatedAt}]'
)

print_block "Assigned wave3 issues past activity threshold" "$assigned_json"
print_block "Unassigned wave3 issues past activity threshold" "$unassigned_json"
print_block "Open wave3 issues with stale label past quiet threshold" "$stale_label_json"

echo "See MAINTAINER_WAVE_PLAYBOOK.md (Backlog freshness review)."
