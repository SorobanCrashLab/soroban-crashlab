# Wave 4 Canonical Backlog Policy

This document defines the source-of-truth and normalization rules for Wave 4 issue publishing.

## Source of Truth

- Canonical publishing source: `ops/wave4-canonical.tsv`
- Generated from: `ops/wave4-issues.tsv`, `ops/wave4-missing.tsv`, and `ops/wave4-new-frontend.tsv`
- Generator: `scripts/build-wave4-canonical.py`

Publishing script behavior:

- `scripts/create-wave4-issues.sh` reads `ops/wave4-canonical.tsv` by default.
- It fails fast if merge markers or duplicate titles are detected.
- It skips rows where `status=implemented`.

## Canonical Schema

`title|complexity|area|type|summary|acceptance|status`

Allowed values:

- `complexity`: `trivial`, `medium`, `high`
- `status`: empty or `implemented`

## Title Normalization Rules

Applied by `build-wave4-canonical.py`:

- Normalize dedupe key using lowercase title and collapsed spaces.
- Remove trailing seed suffixes such as `[59]` for dedupe and canonical title output.

Guidelines for new entries:

- Keep titles action-first and concise (for example: `Add run cancellation command`).
- Do not include seed suffixes like `[51]` in canonical titles.
- Avoid both `page` and `component` variants for the same feature unless they are truly separate deliverables.

## Status Rules

- `implemented`: code/docs are present and merged; issue should not be republished.
- Empty status: item is still backlog-ready and can be published.

## Regeneration Workflow

1. Update source TSV inputs as needed.
2. Regenerate canonical TSV:
   - `python3 scripts/build-wave4-canonical.py`
3. Spot-check canonical output for accidental semantic duplicates.
4. Publish issues from canonical source:
   - `./scripts/create-wave4-issues.sh`

## Notes on Semantic Duplicates

The generator performs deterministic title normalization and source-priority merging.
It does not attempt aggressive semantic merging (for example, rewriting substantially different titles that describe similar work). Maintainers should run manual review for near-duplicate wording before large publish batches.
