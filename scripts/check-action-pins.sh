#!/usr/bin/env bash
set -euo pipefail

# Structural checks on the action pins in .github/workflows/*.yml.
#
# Every workflow pin here was a fabricated SHA that GitHub could not resolve, so
# each of those workflows died at "Prepare all required actions" without running
# a single step. Nine of thirteen workflows were affected and the only reason
# anything looked healthy is that `ci.yml` had been reduced to a placeholder
# that always passes.
#
# This check cannot tell you whether a SHA *exists* — that needs the network —
# but it catches the two shapes that fabricated pins reliably take, both of
# which were present here:
#
#   1. a pin that is not exactly 40 hex characters (one was 41, so no real
#      commit could ever have matched it), and
#   2. one SHA shared by several different actions (five different actions all
#      pointed at the same placeholder), which is impossible for genuine
#      releases, since each action has its own commit history.
#
# Together those two catch a copy-pasted or synthetic pin without needing an API
# token, and cost nothing to run.

status=0

# ---------------------------------------------------------------- 1. length
malformed="$(
  grep -rhoE 'uses: [^ ]+@[0-9a-fA-F]+' .github/workflows/*.yml |
    while IFS= read -r ref; do
      sha="${ref##*@}"
      if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
        printf '%s  (%d characters, expected 40)\n' "$ref" "${#sha}"
      fi
    done
)"

if [[ -n "$malformed" ]]; then
  echo "Action pins that are not valid 40-character commit SHAs:" >&2
  echo "$malformed" >&2
  echo >&2
  echo "A SHA that is not exactly 40 hex characters cannot match any commit," >&2
  echo "so the workflow fails before running a step." >&2
  status=1
fi

# ------------------------------------------------------- 2. shared SHA pins
# `sort -u` collapses repeated uses of the *same* action, which is normal and
# fine. Only a SHA carrying two or more *different* action names is a problem,
# so the grouping below has to count distinct names per SHA, not occurrences.
shared="$(
  grep -rhoE 'uses: [A-Za-z0-9_./-]+@[0-9a-f]{40}' .github/workflows/*.yml |
    sed -E 's/^uses: //' |
    awk -F'@' '{ print $2, $1 }' |
    sort -u |
    awk '
      $1 != sha {
        if (sha != "" && count > 1) printf "%s%s\n", report, ""
        sha = $1; count = 0; report = ""
      }
      { count++; report = report "  " $2 "\n" }
      END { if (sha != "" && count > 1) printf "%s%s", report, "" }
    '
)"

if [[ -n "$shared" ]]; then
  echo >&2
  echo "One commit SHA pinned to more than one action:" >&2
  echo "$shared" >&2
  echo >&2
  echo "Distinct actions have distinct histories, so a shared SHA means the" >&2
  echo "pin was copied rather than resolved. At least one of these is wrong." >&2
  status=1
fi

if [[ "$status" -ne 0 ]]; then
  echo >&2
  echo "Resolve each pin with:" >&2
  echo "  gh api repos/<owner>/<repo>/git/ref/tags/<version>" >&2
  echo "and use the 'object.sha' of the tag (dereference annotated tags)." >&2
  exit "$status"
fi

echo "All action pins are 40-character SHAs, each pinned to a single action."
