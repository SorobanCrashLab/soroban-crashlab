#!/usr/bin/env bash
# scripts/detect-duplicates.sh — Audit backlog and GitHub issues for near-duplicate titles and scope overlap.
#
# Usage:
#   bash scripts/detect-duplicates.sh [--local PATH] [--repo OWNER/REPO] [--no-remote]
#
# Environment:
#   REPO         Default SorobanCrashLab/soroban-crashlab
#   ISSUE_FILE   Default ops/wave3-issues.tsv

set -euo pipefail

REPO="${REPO:-SorobanCrashLab/soroban-crashlab}"
ISSUE_FILE="${ISSUE_FILE:-ops/wave3-issues.tsv}"
NO_REMOTE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) ISSUE_FILE="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --no-remote) NO_REMOTE=true; shift 1 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# Determine python command
if command -v python3 &>/dev/null; then
  PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
  PYTHON_CMD="python"
elif command -v python.exe &>/dev/null; then
  PYTHON_CMD="python.exe"
else
  echo "Error: python is not installed." >&2
  exit 2
fi

PYTHON_ARGS=()
if [[ -f "$ISSUE_FILE" ]]; then
  PYTHON_ARGS+=("--local" "$ISSUE_FILE")
fi

PYTHON_ARGS+=("--repo" "$REPO")

if [[ "$NO_REMOTE" == "true" ]]; then
  PYTHON_ARGS+=("--no-remote")
fi

echo "Running duplicate detection audit..."
$PYTHON_CMD scripts/detect-duplicates.py "${PYTHON_ARGS[@]}"
