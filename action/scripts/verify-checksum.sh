#!/usr/bin/env bash
# Verify a file's SHA-256 against an expected digest (#1863).
#
# Portable across Linux runners (sha256sum) and macOS (shasum). On mismatch it
# prints a GitHub ::error annotation and exits non-zero so a tampered or stale
# binary never reaches the replay step.
#
#   verify-checksum.sh <file> <expected-sha256>

set -euo pipefail

file="${1:?usage: verify-checksum.sh <file> <expected-sha256>}"
expected="${2:?usage: verify-checksum.sh <file> <expected-sha256>}"

if [ ! -f "$file" ]; then
  echo "::error::checksum target '$file' does not exist"
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$file" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$file" | awk '{print $1}')"
else
  echo "::error::no SHA-256 tool found (need 'sha256sum' or 'shasum')"
  exit 1
fi

expected="$(printf '%s' "$expected" | tr 'A-F' 'a-f')"
actual="$(printf '%s' "$actual" | tr 'A-F' 'a-f')"

if [ "$actual" != "$expected" ]; then
  echo "::error::checksum mismatch for '$file': expected $expected, got $actual"
  exit 1
fi

echo "checksum ok: $file ($actual)"
