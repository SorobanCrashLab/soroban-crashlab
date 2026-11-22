#!/usr/bin/env bash
set -euo pipefail

# Guard against a second, stray source tree appearing at the repository root.
#
# A root-level `src/` used to hold `integrations/datadog.ts` and its spec. It
# imported `hot-shots` and `dotenv` — neither declared in any package.json —
# and sat outside every tsconfig, so tsc, eslint and Vitest never saw it. It
# compiled against nothing, its spec was never executed by CI, and grep results
# for the Datadog integration doubled. The real integration is the API route at
# apps/web/src/app/api/integrations/datadog/.
#
# Deleting the tree is not enough on its own: the next stray tree would land
# just as silently. This check fails the build instead.

# Directories that may legitimately contain source files. Anything tracked
# outside them is a phantom tree: unreachable by the toolchain, untested, and
# free to rot.
allowed_roots=(apps contracts scripts ops docs .github)

is_allowed() {
  local path="$1"
  local root
  for root in "${allowed_roots[@]}"; do
    if [[ "$path" == "$root"/* ]]; then
      return 0
    fi
  done
  return 1
}

# Only tracked files matter. Untracked scratch files are the developer's
# business until someone adds them to the repository.
#
# A path staged for deletion is still listed by `ls-files --cached` until the
# commit lands, so those are skipped: this check must not flag the very
# deletion it exists to accompany. Testing the working tree is enough to tell
# them apart, and needs no extra git plumbing.
stray_sources="$(
  git ls-files --cached -- '*.ts' '*.tsx' '*.mts' '*.cts' |
    while IFS= read -r file; do
      [[ -e "$file" ]] || continue
      is_allowed "$file" || printf '%s\n' "$file"
    done
)"

if [[ -n "$stray_sources" ]]; then
  echo "Tracked TypeScript sources exist outside the allowed source roots" >&2
  echo "(${allowed_roots[*]}/):" >&2
  echo "$stray_sources" >&2
  echo >&2
  echo "These files are outside every tsconfig, so tsc, eslint and the test" >&2
  echo "runner never load them: they cannot fail CI and are never executed." >&2
  echo >&2
  echo "Move the code into apps/ (the only TypeScript project) or delete it." >&2
  echo "See issue #1673." >&2
  exit 1
fi

echo "No tracked TypeScript sources outside ${allowed_roots[*]}/."
