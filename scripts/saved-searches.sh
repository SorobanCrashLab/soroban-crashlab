#!/usr/bin/env bash
# scripts/saved-searches.sh — Surface common Wave triage search queries.
#
# Usage:
#   bash scripts/saved-searches.sh [--repo OWNER/REPO]
#
# Environment:
#   REPO             Default SorobanCrashLab/soroban-crashlab
#   WAVE_LABEL       Default wave3
#   STALE_DAYS       Days of inactivity before an assigned issue is stale (default: 3)

set -euo pipefail

REPO="${REPO:-SorobanCrashLab/soroban-crashlab}"
WAVE_LABEL="${WAVE_LABEL:-wave3}"
STALE_DAYS="${STALE_DAYS:-3}"

# Parse optional --repo flag.
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# Calculate the stale date (N days ago) in YYYY-MM-DD format.
if date --version &>/dev/null 2>&1; then
  # GNU date
  STALE_DATE=$(date -d "${STALE_DAYS} days ago" +%Y-%m-%d)
else
  # BSD/macOS date
  STALE_DATE=$(date -v-"${STALE_DAYS}"d +%Y-%m-%d 2>/dev/null || date -u -j -f "%Y-%m-%d" "$(date +%Y-%m-%d)" -v-"${STALE_DAYS}"d +%Y-%m-%d)
fi

echo "### 🌊 Wave Triage Saved Searches: ${REPO} (${WAVE_LABEL})"
echo ""
echo "Use these queries to filter the issue board during triage."
echo ""

# 1. Pending Review
# Issues with open PRs awaiting maintainer review.
QUERY_PENDING="is:open is:issue label:${WAVE_LABEL} linked:pr"
ENCODED_PENDING="is%3Aopen+is%3Aissue+label%3A${WAVE_LABEL}+linked%3Apr"
echo "#### 🔍 Pending Review"
echo "Issues with linked PRs awaiting review."
echo "- **gh command**: \`gh issue list -R ${REPO} --search \"${QUERY_PENDING}\"\`"
echo "- **Web URL**: https://github.com/${REPO}/issues?q=${ENCODED_PENDING}"
echo ""

# 2. Stale
# Issues assigned but with no activity in the last STALE_DAYS days.
QUERY_STALE="is:open is:issue label:${WAVE_LABEL} assignee:* updated:<${STALE_DATE}"
ENCODED_STALE="is%3Aopen+is%3Aissue+label%3A${WAVE_LABEL}+assignee%3A*+updated%3A%3C${STALE_DATE}"
echo "#### 🔍 Stale"
echo "Assigned issues with no activity since ${STALE_DATE} (${STALE_DAYS}d ago)."
echo "- **gh command**: \`gh issue list -R ${REPO} --search \"${QUERY_STALE}\"\`"
echo "- **Web URL**: https://github.com/${REPO}/issues?q=${ENCODED_STALE}"
echo ""

# 3. Blocked
# Issues explicitly marked as blocked.
QUERY_BLOCKED="is:open is:issue label:${WAVE_LABEL} label:blocked"
ENCODED_BLOCKED="is%3Aopen+is%3Aissue+label%3A${WAVE_LABEL}+label%3Ablocked"
echo "#### 🔍 Blocked"
echo "Issues explicitly marked as blocked."
echo "- **gh command**: \`gh issue list -R ${REPO} --search \"${QUERY_BLOCKED}\"\`"
echo "- **Web URL**: https://github.com/${REPO}/issues?q=${ENCODED_BLOCKED}"
echo ""
