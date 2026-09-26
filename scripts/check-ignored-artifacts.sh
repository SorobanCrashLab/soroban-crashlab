#!/usr/bin/env bash
set -euo pipefail

tracked_matches="$(
  git ls-files --cached -- \
    ':(glob)**/__pycache__/**' \
    ':(glob)**/*.pyc' \
    ':(glob)**/.mypy_cache/**' \
    ':(glob)**/*.tsbuildinfo' \
    ':(glob)**/*_output.txt' \
    ':(glob)**/test-results/**' \
    ':(glob)**/playwright-report/**'
)"

if [[ -n "$tracked_matches" ]]; then
  echo "Tracked files match ignored artifact patterns:" >&2
  echo "$tracked_matches" >&2
  echo "Remove these files from git tracking before merging." >&2
  exit 1
fi

echo "No tracked ignored artifacts found."
