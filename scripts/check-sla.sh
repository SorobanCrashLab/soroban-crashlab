#!/usr/bin/env bash
# check-sla.sh — Surface open PRs and issues that have breached Wave SLA timers.
#
# Exits 0 when no breaches are found.
# Exits 1 when at least one breach is detected so CI jobs can fail loudly.
#
# Requirements: gh CLI authenticated as a repo maintainer.
#
# Usage:
#   bash scripts/check-sla.sh [--repo OWNER/REPO]
#
# Environment variables:
#   REPO             Override the default repository (SorobanCrashLab/soroban-crashlab)
#   PR_SLA_H         Hours before a PR without a review is flagged   (default: 24)
#   ISSUE_SLA_H      Hours before an assigned issue with no update is flagged (default: 48)
#   BLOCKED_PR_SLA_H Hours before a blocked PR with no update is flagged (default: 24)

set -euo pipefail

REPO="${REPO:-SorobanCrashLab/soroban-crashlab}"
PR_SLA_H="${PR_SLA_H:-24}"
ISSUE_SLA_H="${ISSUE_SLA_H:-48}"
BLOCKED_PR_SLA_H="${BLOCKED_PR_SLA_H:-24}"

# Parse optional --repo flag.
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ! command -v gh &>/dev/null; then
  echo "Error: gh CLI is not installed." >&2
  exit 2
fi

if ! gh auth status &>/dev/null; then
  echo "Error: gh is not authenticated. Run 'gh auth login' first." >&2
  exit 2
fi

# iso8601_age_h <iso8601-timestamp>
# Returns the age of the timestamp in whole hours from now.
iso8601_age_h() {
  local ts="$1"
  local epoch_then epoch_now
  # macOS date requires a slightly different format flag than GNU date.
  if date --version &>/dev/null 2>&1; then
    # GNU date
    epoch_then=$(date -d "$ts" +%s)
  else
    # BSD/macOS date — strip trailing Z and replace T with a space
    local clean="${ts%Z}"
    clean="${clean/T/ }"
    epoch_then=$(date -u -j -f "%Y-%m-%d %H:%M:%S" "$clean" +%s 2>/dev/null \
      || date -u -j -f "%Y-%m-%dT%H:%M:%S" "${ts%Z}" +%s)
  fi
  epoch_now=$(date -u +%s)
  echo $(( (epoch_now - epoch_then) / 3600 ))
}

breaches=0

# ── 1. PRs with no review older than PR_SLA_H ───────────────────────────────
echo "==> Checking open PRs for review SLA breach (> ${PR_SLA_H}h without review) ..."

pr_breach=0
while IFS=$'\t' read -r number title created_at; do
  [[ -z "$number" ]] && continue

  age_h=$(iso8601_age_h "$created_at")

  # Check whether the PR has at least one submitted review.
  review_count=$(gh api \
    "repos/${REPO}/pulls/${number}/reviews" \
    --jq '[.[] | select(.state != "PENDING")] | length' 2>/dev/null || echo 0)

  if [[ "$review_count" -eq 0 && "$age_h" -ge "$PR_SLA_H" ]]; then
    printf "  [PR #%s] \"%s\" — open %dh, no reviews (SLA: %dh)\n" \
      "$number" "$title" "$age_h" "$PR_SLA_H"
    pr_breach=1
    breaches=1
  fi
done < <(gh pr list \
  --repo "$REPO" \
  --state open \
  --json number,title,createdAt \
  --jq '.[] | [.number, .title, .createdAt] | @tsv')

[[ "$pr_breach" -eq 0 ]] && echo "  All open PRs are within the review SLA."

# ── 2. Assigned issues with no update older than ISSUE_SLA_H ─────────────────
echo ""
echo "==> Checking assigned issues for update SLA breach (> ${ISSUE_SLA_H}h without update) ..."

issue_breach=0
while IFS=$'\t' read -r number title updated_at assignee; do
  [[ -z "$number" || -z "$assignee" ]] && continue

  age_h=$(iso8601_age_h "$updated_at")

  if [[ "$age_h" -ge "$ISSUE_SLA_H" ]]; then
    printf "  [Issue #%s] \"%s\" — assigned to @%s, last update %dh ago (SLA: %dh)\n" \
      "$number" "$title" "$assignee" "$age_h" "$ISSUE_SLA_H"
    issue_breach=1
    breaches=1
  fi
done < <(gh issue list \
  --repo "$REPO" \
  --state open \
  --assignee '*' \
  --json number,title,updatedAt,assignees \
  --jq '.[] | [.number, .title, .updatedAt, (.assignees[0].login // "")] | @tsv')

[[ "$issue_breach" -eq 0 ]] && echo "  All assigned issues are within the update SLA."

# ── 3. Blocked PRs with no update older than BLOCKED_PR_SLA_H ─────────────────
echo ""
echo "==> Checking blocked PRs for update SLA breach (> ${BLOCKED_PR_SLA_H}h without update) ..."

blocked_breach=0
while IFS=$'\t' read -r number title updated_at; do
  [[ -z "$number" ]] && continue

  age_h=$(iso8601_age_h "$updated_at")

  if [[ "$age_h" -ge "$BLOCKED_PR_SLA_H" ]]; then
    printf "  [PR #%s] \"%s\" — blocked, last update %dh ago (SLA: %dh)\n" \
      "$number" "$title" "$age_h" "$BLOCKED_PR_SLA_H"
    printf "    Escalation Template:\n"
    printf "    \"@maintainer: This PR has been blocked on dependencies for >%dh. Please provide a status update or resolve the block to prevent stale backlog drift.\"\n" "$BLOCKED_PR_SLA_H"
    blocked_breach=1
    breaches=1
  fi
done < <(gh pr list \
  --repo "$REPO" \
  --state open \
  --label "blocked" \
  --json number,title,updatedAt \
  --jq '.[] | [.number, .title, .updatedAt] | @tsv')

[[ "$blocked_breach" -eq 0 ]] && echo "  All blocked PRs are within the update SLA."

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
if [[ "$breaches" -gt 0 ]]; then
  echo "SLA check FAILED — one or more items are past their SLA window."
  echo "See the Contributor SLA targets section in MAINTAINER_WAVE_PLAYBOOK.md for escalation steps."
  exit 1
else
  echo "SLA check PASSED — no breaches detected."
  exit 0
fi
