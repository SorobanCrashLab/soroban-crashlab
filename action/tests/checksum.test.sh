#!/usr/bin/env bash
# Self-test for scripts/verify-checksum.sh (#1863).
#
# Proves a matching digest passes and a tampered one is rejected, so the
# composite action can trust a downloaded CLI only when the checksum matches.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/../scripts/verify-checksum.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

payload="$tmp/crashlab"
printf 'a pinned crashlab artifact\n' > "$payload"

if command -v sha256sum >/dev/null 2>&1; then
  digest="$(sha256sum "$payload" | awk '{print $1}')"
else
  digest="$(shasum -a 256 "$payload" | awk '{print $1}')"
fi

# 1. A matching digest passes (and accepts upper-case input).
bash "$script" "$payload" "${digest^^}" >/dev/null

# 2. A tampered digest fails with a non-zero exit.
if bash "$script" "$payload" "0000000000000000000000000000000000000000000000000000000000000000" >/dev/null 2>&1; then
  echo "FAIL: mismatch should exit non-zero" >&2
  exit 1
fi

# 3. A missing file fails.
if bash "$script" "$tmp/absent" "$digest" >/dev/null 2>&1; then
  echo "FAIL: missing file should exit non-zero" >&2
  exit 1
fi

echo "checksum self-test ok"
