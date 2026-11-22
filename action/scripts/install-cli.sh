#!/usr/bin/env bash
# Resolve the CrashLab CLI used by the composite action (#1863).
#
# Two paths, both writing `cli=<abs-path>` to $GITHUB_OUTPUT:
#   * CRASHLAB_BUILD_FROM_SOURCE=true -> `cargo build --release --bin crashlab`
#   * otherwise                       -> download the pinned release archive
#                                        and verify its SHA-256 before use.
#
# A download without an expected checksum is refused: a distributed action must
# never execute an unverified binary.

set -euo pipefail

action_dir="${CRASHLAB_ACTION_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
out="${GITHUB_OUTPUT:-/dev/stdout}"

emit() { echo "$1" >> "$out"; }

if [ "${CRASHLAB_BUILD_FROM_SOURCE:-false}" = "true" ]; then
  source_dir="${CRASHLAB_SOURCE_DIR:-contracts}"
  echo "Building crashlab from source in '$source_dir'..."
  cargo build --release --bin crashlab --manifest-path "$source_dir/Cargo.toml"
  cli="$(cd "$source_dir" && pwd)/target/release/crashlab"
  if [ ! -x "$cli" ]; then
    echo "::error::cargo build did not produce '$cli'"
    exit 1
  fi
  {
    echo "cli=$cli"
    echo "version=source"
  } >> "$out"
  exit 0
fi

version="${CRASHLAB_VERSION:?CRASHLAB_VERSION is required}"
expected="${CRASHLAB_EXPECTED_SHA256:-}"
if [ -z "$expected" ]; then
  echo "::error::expected-sha256 is required to download the CLI; pin the release checksum or set build-from-source: true"
  exit 1
fi

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target="x86_64-unknown-linux-gnu" ;;
  Linux-aarch64) target="aarch64-unknown-linux-gnu" ;;
  Darwin-x86_64) target="x86_64-apple-darwin" ;;
  Darwin-arm64) target="aarch64-apple-darwin" ;;
  *)
    echo "::error::unsupported runner platform: $(uname -s)-$(uname -m)"
    exit 1
    ;;
esac

asset="crashlab-${version}-${target}.tar.gz"
url="https://github.com/SorobanCrashLab/soroban-crashlab/releases/download/${version}/${asset}"
work="$(mktemp -d)"
archive="$work/$asset"

echo "Downloading $url"
if ! curl -fsSL "$url" -o "$archive"; then
  echo "::error::failed to download $asset for $version; is it a published release with a binary asset?"
  exit 1
fi

bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-checksum.sh" "$archive" "$expected"

tar -xzf "$archive" -C "$work"
cli="$work/crashlab"
if [ ! -x "$cli" ]; then
  echo "::error::$asset did not contain an executable 'crashlab'"
  exit 1
fi

echo "cli=$cli" >> "$out"
echo "version=$version" >> "$out"
