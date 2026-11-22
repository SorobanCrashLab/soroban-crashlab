#!/usr/bin/env bash
# Release evidence (#1901): does the engine at HEAD still accept the fixture
# corpus shipped with the previous release?
#
#   scripts/release/fixture-compat.sh <previous-tag> [report.md]
#
# Runs the current `import-corpus` against the previous tag's
# contracts/crashlab-core/fixtures and against HEAD's, and fails when the
# previous corpus no longer imports. A shrinking accepted count is a breaking
# change under docs/releases/policy.md (bundle/seed schema surface).
set -euo pipefail

prev="${1:?usage: fixture-compat.sh <previous-tag> [report.md]}"
report="${2:-/dev/stdout}"
root="$(git rev-parse --show-toplevel)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/prev"
git -C "$root" archive "$prev" contracts/crashlab-core/fixtures | tar -x -C "$work/prev"

cargo build --quiet --manifest-path "$root/contracts/crashlab-core/Cargo.toml" --bin import-corpus
bin="$(cargo metadata --format-version 1 --no-deps --manifest-path "$root/contracts/crashlab-core/Cargo.toml" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>console.log(JSON.parse(s).target_directory))')/debug/import-corpus"

run() { "$bin" "$1" 2>&1 | tail -n 1; }
prev_out="$(run "$work/prev/contracts/crashlab-core/fixtures")" && prev_ok=true || prev_ok=false
head_out="$(run "$root/contracts/crashlab-core/fixtures")" && head_ok=true || head_ok=false

{
  echo "### Fixture compatibility vs \`$prev\`"
  echo
  echo "| Corpus | Result | Output |"
  echo "|---|---|---|"
  echo "| \`$prev\` fixtures, HEAD engine | $([[ $prev_ok == true ]] && echo '✅ imports' || echo '❌ fails') | \`$prev_out\` |"
  echo "| HEAD fixtures, HEAD engine | $([[ $head_ok == true ]] && echo '✅ imports' || echo '❌ fails') | \`$head_out\` |"
} >"$report"

[[ $prev_ok == true && $head_ok == true ]]
