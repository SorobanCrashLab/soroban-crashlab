#!/usr/bin/env python3
"""Generate a JSON issue catalog from a roadmap TSV file.

Input TSV columns:
    title\tbody\tlabels(comma-separated)\tmilestone(optional)

Output JSON format:
    [
      {
        "title": "...",
        "body": "...",
        "labels": ["..."],
        "milestone": "..." | null
      }
    ]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate roadmap issues.json from TSV input.")
    parser.add_argument("input", nargs="?", default="ops/wave3-issues.tsv", help="Input TSV file")
    parser.add_argument("-o", "--output", help="Write JSON to a file instead of stdout")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print the JSON output")
    parser.add_argument(
        "--include-implemented",
        action="store_true",
        help="Keep rows whose status column is marked implemented",
    )
    return parser.parse_args()


def split_fields(line: str) -> list[str]:
    if "\t" in line and "|" not in line:
        return [field.strip() for field in line.split("\t")]
    return [field.strip() for field in line.split("|")]


def load_rows(path: Path, include_implemented: bool) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("<<<<<<<") or line.startswith("=======") or line.startswith(">>>>>>>"):
                continue

            fields = split_fields(line)
            if not fields:
                continue

            header = [field.lower() for field in fields]
            if header[:4] == ["title", "body", "labels", "milestone"]:
                continue
            if header[:8] == ["title", "complexity", "area", "type", "summary", "acceptance", "status", "issue_number"]:
                continue

            if len(fields) >= 8:
                title, complexity, area, issue_type, summary, acceptance, status, issue_number = fields[:8]
                if status and status.lower() == "implemented" and not include_implemented:
                    continue

                labels = [label for label in (complexity, area, issue_type) if label]
                body_parts = [summary]
                if acceptance:
                    body_parts.append("")
                    body_parts.append(f"Acceptance: {acceptance}")
                rows.append(
                    {
                        "title": title,
                        "body": "\n".join(body_parts).strip(),
                        "labels": labels,
                        "milestone": None,
                        "issue_number": issue_number or None,
                    }
                )
                continue

            if len(fields) >= 4:
                title, body, labels_text, milestone = (fields + [""] * 4)[:4]
                labels = [label.strip() for label in labels_text.split(",") if label.strip()]
                rows.append(
                    {
                        "title": title,
                        "body": body,
                        "labels": labels,
                        "milestone": milestone or None,
                    }
                )

    return rows


def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    issues = load_rows(input_path, args.include_implemented)

    indent = 2 if args.pretty or args.output else None
    cleaned_issues: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    for issue in issues:
        title = issue["title"]
        if title in seen_titles:
            continue
        seen_titles.add(title)
        cleaned_issues.append({key: value for key, value in issue.items() if key != "issue_number"})

    payload = json.dumps(cleaned_issues, indent=indent, ensure_ascii=False)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
