#!/usr/bin/env python3
"""Push missing Wave3 issues safely.

Usage:
    python3 scripts/push_wave3_missing.py --input ops/wave3-missing.tsv --repo SorobanCrashLab/soroban-crashlab [--yes]

Behavior:
 - Dry-run by default (no issues created). Use --yes to actually create.
 - Prefers GitHub REST when GITHUB_TOKEN is set; falls back to `gh` CLI.
 - Checks existing issues using `--check-state` (default: all) and skips any title that
     already exists in that issue set (prevents recreating closed/solved issues).
 - Writes a local record file at .ops/pushed_wave3_issues.json to avoid duplicates across runs.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from typing import List


def normalize(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"\s*\[\d+\]$", "", s)
    s = re.sub(r"[^a-z0-9 ]+", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def parse_tsv(path: str) -> List[dict]:
    with open(path, "r") as f:
        lines = [l.rstrip("\n") for l in f if l.strip()]
    if not lines:
        return []
    header = None
    if "|" in lines[0].lower():
        header = lines[0]
        data = lines[1:]
    else:
        data = lines
    rows = []
    for l in data:
        parts = [p.strip() for p in l.split("|")] if "|" in l else [l.strip()]
        title = parts[0] if parts else l
        rows.append({"title": title, "parts": parts, "raw": l})
    return rows


def gh_list_titles_cli(repo: str, state: str = "all") -> List[str]:
    try:
        out = subprocess.check_output(["gh", "issue", "list", "-R", repo, "--label", "wave3", "--state", state, "--limit", "500", "--json", "title"], text=True)
        arr = json.loads(out)
        return [a.get("title", "").strip() for a in arr if a.get("title")]
    except Exception:
        return []


def gh_create_issue_cli(repo: str, title: str, body: str, labels: List[str]) -> int:
    cmd = ["gh", "issue", "create", "-R", repo, "--title", title, "--body", body]
    for l in labels:
        if l:
            cmd += ["--label", l]
    out = subprocess.check_output(cmd, text=True)
    try:
        # gh by default prints URL; try to extract number
        m = re.search(r"/issues/(\d+)", out)
        if m:
            return int(m.group(1))
    except Exception:
        pass
    return -1


def gh_list_titles_api(repo: str, token: str, state: str = "all") -> List[str]:
    # use simple urllib to avoid external deps
    import urllib.request
    titles = []
    page = 1
    while True:
        url = f"https://api.github.com/repos/{repo}/issues?labels=wave3&state={state}&per_page=100&page={page}"
        req = urllib.request.Request(url, headers={"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.load(resp)
        except Exception as e:
            print("Error fetching issues via API:", e, file=sys.stderr)
            break
        if not data:
            break
        for i in data:
            titles.append(i.get("title", "").strip())
        if len(data) < 100:
            break
        page += 1
    return titles


def gh_create_issue_api(repo: str, token: str, title: str, body: str, labels: List[str]) -> int:
    import urllib.request
    url = f"https://api.github.com/repos/{repo}/issues"
    payload = json.dumps({"title": title, "body": body, "labels": labels}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Authorization": f"token {token}", "Content-Type": "application/json", "Accept": "application/vnd.github.v3+json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
            return int(data.get("number", -1))
    except Exception as e:
        print("Error creating issue via API:", e, file=sys.stderr)
        return -1


def build_body(parts: List[str]) -> str:
    # parts: title|complexity|area|type|summary|acceptance|status
    title = parts[0] if parts else ""
    complexity = parts[1] if len(parts) > 1 else ""
    area = parts[2] if len(parts) > 2 else ""
    summary = parts[4] if len(parts) > 4 else ""
    acceptance = parts[5] if len(parts) > 5 else ""
    slug = re.sub(r"[^a-z0-9\-]", "", re.sub(r"\s+", "-", title.lower()))
    body = f"{title}\n\nPriority: {complexity} | Area: {area}\n\nDescription:\n{summary}\n\nAcceptance Criteria:\n{acceptance}\n\nFiles to Update:\n- apps/web/src/app/*\n\nFiles to Create:\n- apps/web/src/app/{slug}.tsx\n"
    return body


def load_record(path: str) -> dict:
    if os.path.exists(path):
        with open(path, "r") as f:
            try:
                return json.load(f)
            except Exception:
                return {}
    return {}


def save_record(path: str, data: dict):
    d = os.path.dirname(path)
    if d and not os.path.exists(d):
        os.makedirs(d, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True, help="TSV file with missing entries")
    p.add_argument("--repo", required=True, help="owner/repo")
    p.add_argument("--yes", action="store_true", help="Actually create issues (default: dry-run)")
    p.add_argument("--check-state", choices=["open", "closed", "all"], default="all", help="Which issue states to check for duplicates (default: all)")
    p.add_argument("--record", default="soroban-crashlab/.ops/pushed_wave3_issues.json", help="Local record path")
    args = p.parse_args()

    rows = parse_tsv(args.input)
    if not rows:
        print("No rows found in", args.input)
        return

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    existing = []
    check_state = getattr(args, 'check_state', 'all')
    if token:
        existing = gh_list_titles_api(args.repo, token, check_state)
    if not existing:
        existing = gh_list_titles_cli(args.repo, check_state)
    existing_norm = set([normalize(t) for t in existing if t])

    record = load_record(args.record)
    created = []
    for r in rows:
        title = r['title'].strip()
        n = normalize(title)
        if not n:
            continue
        if n in existing_norm:
            print('SKIP (exists):', title)
            continue
        if record.get(n):
            print('SKIP (record):', title, '->', record.get(n))
            continue
        body = build_body(r.get('parts', []))
        labels = ['wave3']
        if len(r.get('parts', []))>1 and r['parts'][1]:
            labels.append(r['parts'][1])
        if len(r.get('parts', []))>2 and r['parts'][2]:
            labels.append(r['parts'][2])
        print('WILL CREATE:', title, 'labels=', labels)
        if not args.yes:
            continue
        # attempt API then fall back to gh CLI
        issue_number = -1
        if token:
            issue_number = gh_create_issue_api(args.repo, token, title, body, labels)
        if issue_number == -1:
            try:
                issue_number = gh_create_issue_cli(args.repo, title, body, labels)
            except Exception as e:
                print('Creation failed for', title, e, file=sys.stderr)
                time.sleep(1)
                continue
        if issue_number and issue_number != -1:
            record[n] = issue_number
            save_record(args.record, record)
            created.append((issue_number, title))
            # keep local set in sync to avoid creating same title twice in one run
            existing_norm.add(n)

    print('Done. Created', len(created), 'issues (if --yes).')
    for num, t in created:
        print('-', num, t)


if __name__ == '__main__':
    main()
