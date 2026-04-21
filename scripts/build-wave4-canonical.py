#!/usr/bin/env python3
"""Build a canonical, deduplicated Wave 4 backlog TSV.

Inputs:
- ops/wave4-issues.tsv
- ops/wave4-missing.tsv
- ops/wave4-new-frontend.tsv

Output schema:
- title|complexity|area|type|summary|acceptance|status

Dedup key:
- lowercase title
- collapse internal whitespace
- remove trailing seed suffix like " [59]"
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

HEADER = ["title", "complexity", "area", "type", "summary", "acceptance", "status"]
HEADER_PREFIX = HEADER[:6]
SEED_SUFFIX_RE = re.compile(r"\s*\[\d+\]\s*$")


@dataclass(frozen=True)
class BacklogRow:
    source: str
    title: str
    complexity: str
    area: str
    issue_type: str
    summary: str
    acceptance: str
    status: str


def normalize_title(title: str) -> str:
    collapsed = " ".join(title.split()).strip().lower()
    return SEED_SUFFIX_RE.sub("", collapsed).strip()


def strip_seed_suffix(title: str) -> str:
    return SEED_SUFFIX_RE.sub("", " ".join(title.split())).strip()


def is_header(parts: List[str]) -> bool:
    if len(parts) < 6:
        return False
    candidate = [p.strip().lower() for p in parts[:6]]
    return candidate == HEADER_PREFIX


def parse_rows(path: Path, source_name: str) -> List[BacklogRow]:
    rows: List[BacklogRow] = []

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("<<<<<<<") or line.startswith("=======") or line.startswith(">>>>>>>"):
            continue

        parts = [part.strip() for part in raw_line.split("|")]
        if len(parts) < 6:
            continue
        if is_header(parts):
            continue

        title = parts[0]
        if not title:
            continue

        complexity = parts[1].lower() if len(parts) > 1 else ""
        area = parts[2] if len(parts) > 2 else ""
        issue_type = parts[3] if len(parts) > 3 else ""
        summary = parts[4] if len(parts) > 4 else ""
        acceptance = parts[5] if len(parts) > 5 else ""
        status = parts[6].lower() if len(parts) > 6 else ""

        rows.append(
            BacklogRow(
                source=source_name,
                title=title,
                complexity=complexity,
                area=area,
                issue_type=issue_type,
                summary=summary,
                acceptance=acceptance,
                status=status,
            )
        )

    return rows


def preferred_row(rows: Iterable[BacklogRow], source_rank: Dict[str, int]) -> BacklogRow:
    # 1) Prefer source order: issues > missing > new-frontend.
    # 2) Prefer seedless titles.
    # 3) Prefer more descriptive summaries (longer text).
    # 4) Stable tie-breaker by title.
    return min(
        rows,
        key=lambda row: (
            source_rank[row.source],
            1 if SEED_SUFFIX_RE.search(row.title) else 0,
            -len(row.summary.strip()),
            row.title.lower(),
        ),
    )


def first_non_empty(values: Iterable[str], fallback: str) -> str:
    for value in values:
        if value.strip():
            return value
    return fallback


def build_canonical(rows: List[BacklogRow]) -> Tuple[List[BacklogRow], int]:
    grouped: Dict[str, List[BacklogRow]] = {}
    for row in rows:
        key = normalize_title(row.title)
        if not key:
            continue
        grouped.setdefault(key, []).append(row)

    source_rank = {
        "wave4-issues.tsv": 0,
        "wave4-missing.tsv": 1,
        "wave4-new-frontend.tsv": 2,
    }

    canonical: List[BacklogRow] = []
    duplicate_clusters = 0

    for key, cluster in grouped.items():
        if len(cluster) > 1:
            duplicate_clusters += 1

        base = preferred_row(cluster, source_rank)

        title = strip_seed_suffix(base.title)
        complexity = first_non_empty((r.complexity for r in [base] + cluster), base.complexity)
        area = first_non_empty((r.area for r in [base] + cluster), base.area)
        issue_type = first_non_empty((r.issue_type for r in [base] + cluster), base.issue_type)
        summary = first_non_empty((r.summary for r in [base] + cluster), base.summary)
        acceptance = first_non_empty((r.acceptance for r in [base] + cluster), base.acceptance)

        implemented = any(r.status.strip().lower() == "implemented" for r in cluster)
        status = "implemented" if implemented else ""

        canonical.append(
            BacklogRow(
                source="canonical",
                title=title,
                complexity=complexity,
                area=area,
                issue_type=issue_type,
                summary=summary,
                acceptance=acceptance,
                status=status,
            )
        )

    complexity_rank = {"trivial": 0, "medium": 1, "high": 2}
    canonical.sort(
        key=lambda row: (
            row.area.lower(),
            complexity_rank.get(row.complexity.lower(), 99),
            row.title.lower(),
        )
    )

    return canonical, duplicate_clusters


def write_tsv(path: Path, rows: List[BacklogRow]) -> None:
    lines = ["|".join(HEADER)]
    for row in rows:
        fields = [
            row.title,
            row.complexity,
            row.area,
            row.issue_type,
            row.summary,
            row.acceptance,
            row.status,
        ]
        lines.append("|".join(field.replace("\n", " ").strip() for field in fields))

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build canonical Wave 4 backlog TSV")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output TSV path (default: <root>/ops/wave4-canonical.tsv)",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    output = args.output.resolve() if args.output else (root / "ops" / "wave4-canonical.tsv")

    sources = [
        ("wave4-issues.tsv", root / "ops" / "wave4-issues.tsv"),
        ("wave4-missing.tsv", root / "ops" / "wave4-missing.tsv"),
        ("wave4-new-frontend.tsv", root / "ops" / "wave4-new-frontend.tsv"),
    ]

    all_rows: List[BacklogRow] = []
    parsed_counts: Dict[str, int] = {}

    for source_name, path in sources:
        if not path.exists():
            raise FileNotFoundError(f"Missing source file: {path}")
        rows = parse_rows(path, source_name)
        parsed_counts[source_name] = len(rows)
        all_rows.extend(rows)

    canonical, duplicate_clusters = build_canonical(all_rows)
    write_tsv(output, canonical)

    print("Built canonical backlog")
    print(f"Output: {output}")
    for source_name, _ in sources:
        print(f"Parsed {source_name}: {parsed_counts[source_name]}")
    print(f"Canonical rows: {len(canonical)}")
    print(f"Duplicate clusters merged: {duplicate_clusters}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
