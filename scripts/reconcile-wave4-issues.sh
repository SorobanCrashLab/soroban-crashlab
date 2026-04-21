#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ISSUE_FILE="$ROOT_DIR/ops/wave4-issues.tsv"
REPO="SorobanCrashLab/soroban-crashlab"
TARGET_COUNT="${1:-82}"

token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$token" ]; then
  echo "Set GH_TOKEN or GITHUB_TOKEN before running." >&2
  exit 1
fi

python3 - "$ISSUE_FILE" "$REPO" "$TARGET_COUNT" <<'PY'
import csv
import json
import sys
import urllib.request
import http.client
import time
from urllib.error import URLError

issue_file, repo, target_count = sys.argv[1], sys.argv[2], int(sys.argv[3])
import os
token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")

api = "https://api.github.com"
gql = "https://api.github.com/graphql"

owner, name = repo.split("/", 1)

def request_json(url, payload=None, method="POST"):
    for attempt in range(5):
        try:
            data = None
            if payload is not None:
                data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=data, method=method)
            req.add_header("Authorization", f"Bearer {token}")
            req.add_header("Accept", "application/vnd.github+json")
            req.add_header("X-GitHub-Api-Version", "2022-11-28")
            req.add_header("User-Agent", "soroban-crashlab-reconciler")
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read().decode("utf-8")
                if body:
                    return json.loads(body)
                return None
        except (http.client.IncompleteRead, URLError, TimeoutError):
            if attempt == 4:
                raise
            time.sleep(1 + attempt)

def graphql(query, variables):
    response = request_json(gql, {"query": query, "variables": variables}, "POST")
    if response.get("errors"):
        raise RuntimeError(f"GraphQL errors: {response['errors']}")
    return response["data"]

def patch_issue(number, payload):
    return request_json(f"{api}/repos/{repo}/issues/{number}", payload, "PATCH")

allowed_titles = []
with open(issue_file, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f, delimiter="|")
    for row in reader:
        allowed_titles.append(row["title"].strip())

allowed_titles = allowed_titles[:target_count]
allowed_set = set(allowed_titles)

query = """
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $cursor, states: OPEN, labels: [\"wave4\"], orderBy: {field: CREATED_AT, direction: ASC}) {
      nodes {
        number
        title
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
"""

open_issues = []
cursor = None
while True:
    data = graphql(query, {"owner": owner, "name": name, "cursor": cursor})
    issues = data["repository"]["issues"]
    open_issues.extend(issues["nodes"])
    if not issues["pageInfo"]["hasNextPage"]:
        break
    cursor = issues["pageInfo"]["endCursor"]

by_title = {}
for issue in open_issues:
    title = issue["title"].strip()
    by_title.setdefault(title, []).append(issue)

to_close = []

# Close all non-allowed titles
for title, issues in by_title.items():
    if title not in allowed_set:
        to_close.extend(issues)

# For allowed titles, keep one (oldest issue number), close duplicates
for title in allowed_titles:
    issues = by_title.get(title, [])
    if len(issues) <= 1:
        continue
    issues_sorted = sorted(issues, key=lambda i: i["number"])
    keep = issues_sorted[0]["number"]
    for i in issues_sorted[1:]:
        to_close.append(i)

closed = 0
for issue in to_close:
    num = issue["number"]
    try:
        patch_issue(num, {"state": "closed"})
        closed += 1
    except Exception:
        pass

count_query = """
query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
        issues(states: OPEN, labels: [\"wave4\"]) {
            totalCount
        }
    }
}
"""
final_data = graphql(count_query, {"owner": owner, "name": name})
final_open = final_data["repository"]["issues"]["totalCount"]

print(json.dumps({
    "target_count": target_count,
    "initial_open": len(open_issues),
    "closed": closed,
    "final_open": final_open,
}, indent=2))
PY
