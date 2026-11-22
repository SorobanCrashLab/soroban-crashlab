# Ops Backlog

This directory contains the archived Wave 3 backlog sources and helper notes.

## Archived backlog files

- [wave3-backlog.md](wave3-backlog.md) - curated backlog overview
- [wave3-issues.tsv](wave3-issues.tsv) - source TSV for bulk GitHub issue creation
- [wave3-append-rows.tsv](wave3-append-rows.tsv) - supplemental backlog rows
- [wave3-new-frontend.tsv](wave3-new-frontend.tsv) - frontend-focused backlog rows
- [wave3-missing.tsv](wave3-missing.tsv) - rows still awaiting catalog completion

## Current workflow

Roadmap issue generation now lives in `scripts/roadmap/`.

- Use `scripts/roadmap/generate_catalog.py` to convert TSV rows into `issues.json`.
- Use `scripts/roadmap/create_github_issues.sh` to publish roadmap issues to GitHub.

## Archive note

The TSV backlog here is kept for traceability and historical reference. New work should be tracked through GitHub issues and milestones instead of expanding the archived TSV set.
