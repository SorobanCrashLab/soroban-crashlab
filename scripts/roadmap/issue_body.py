"""Format roadmap issue bodies (shared template)."""

from __future__ import annotations

from typing import Iterable, Sequence


def format_issue_body(
    *,
    roadmap_id: int,
    slug: str,
    description: str,
    requirements: Sequence[str],
    files: Sequence[tuple[str, str, str]],
    checklist: Sequence[str],
    blocked_by: Sequence[int] | None = None,
    extra_notes: str | None = None,
) -> str:
    file_lines = "\n".join(
        f"- `{path}` — **{action}** — {note}" for path, action, note in files
    )
    req_lines = "\n".join(f"- {r}" for r in requirements)
    check_lines = "\n".join(f"- [ ] {c}" for c in checklist)
    deps = (
        "\n".join(f"- Blocked by roadmap #{n} (search issues for `ROADMAP-{n:03d}`)" for n in (blocked_by or []))
        or "- None"
    )
    notes = f"\n## Additional notes\n{extra_notes}\n" if extra_notes else ""

    return f"""## Roadmap ID
`ROADMAP-{roadmap_id:03d}`

## Description
{description.strip()}

## Requirements
{req_lines}

## Possible affected files
{file_lines}

## Checklist
{check_lines}

## PR guide
- Create branch: `issue/{roadmap_id}-{slug}`
- Open **one PR per issue** targeting `main`
- PR title format: `type(area): short summary (ROADMAP-{roadmap_id:03d})` using [Conventional Commits](https://www.conventionalcommits.org/)
- Link this issue in the PR body: `Closes #<issue_number>`
- Do **not** commit changes to `pnpm-lock.yaml` or `package-lock.json`
- Changes to `package.json` require a **Maintainer approval** section in the PR describing why
- Keep scope limited to files listed above to avoid merge conflicts

## Dependencies
{deps}
{notes}"""
