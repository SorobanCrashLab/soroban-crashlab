import json
import re
import subprocess
import tempfile
import time
from pathlib import Path

OWNER = "SorobanCrashLab"
REPO = "soroban-crashlab"
LOG = Path("/tmp/wave3_issue_body_fix.log")
RES = Path("/tmp/wave3_issue_body_fix_result.json")

QUERY = """
query($owner: String!, $repo: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    issues(first: $first, after: $after, states: [OPEN, CLOSED], orderBy: {field: CREATED_AT, direction: ASC}) {
      nodes { number title body state }
      pageInfo { hasNextPage endCursor }
    }
  }
}
"""

PATTERNS = [
    ("WAVE3", "WAVE4"),
    ("Wave3", "Wave4"),
    ("wave3", "wave4"),
    ("WAVE 3", "WAVE 4"),
    ("Wave 3", "Wave 4"),
    ("wave 3", "wave 4"),
    ("WAVE-3", "WAVE-4"),
    ("Wave-3", "Wave-4"),
    ("wave-3", "wave-4"),
    ("WAVE_3", "WAVE_4"),
    ("Wave_3", "Wave_4"),
    ("wave_3", "wave_4"),
]
CHECK_RE = re.compile(
    r"WAVE3|Wave3|wave3|WAVE 3|Wave 3|wave 3|WAVE-3|Wave-3|wave-3|WAVE_3|Wave_3|wave_3"
)


def gh_graphql(after=None):
    cmd = [
        "gh",
        "api",
        "graphql",
        "-f",
        f"query={QUERY}",
        "-F",
        f"owner={OWNER}",
        "-F",
        f"repo={REPO}",
        "-F",
        "first=100",
    ]
    if after:
        cmd.extend(["-F", f"after={after}"])
    return subprocess.run(cmd, capture_output=True, text=True)


def fetch_all_issues():
    issues = []
    after = None
    while True:
        r = gh_graphql(after)
        if r.returncode != 0:
            raise RuntimeError(r.stderr.strip() or r.stdout.strip())
        data = json.loads(r.stdout)
        blk = data["data"]["repository"]["issues"]
        issues.extend(blk["nodes"])
        if not blk["pageInfo"]["hasNextPage"]:
            break
        after = blk["pageInfo"]["endCursor"]
    return issues


def transform(body):
    text = body or ""
    out = text
    for src, dst in PATTERNS:
        out = out.replace(src, dst)
    return out


def patch_issue_body(number, new_body):
    payload = {"body": new_body}
    with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as tf:
        json.dump(payload, tf)
        pth = tf.name
    cmd = [
        "gh",
        "api",
        "-X",
        "PATCH",
        f"/repos/{OWNER}/{REPO}/issues/{number}",
        "--input",
        pth,
    ]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=45)


def main():
    log = []

    issues = fetch_all_issues()
    before = [i for i in issues if CHECK_RE.search(i.get("body") or "")]
    candidates = []

    for issue in before:
        new_body = transform(issue.get("body") or "")
        if new_body != (issue.get("body") or ""):
            candidates.append((issue["number"], issue["title"], new_body))

    log.append(f"total_issues={len(issues)}")
    log.append(f"before_matches={len(before)}")
    log.append(f"candidate_updates={len(candidates)}")
    print(f"total_issues={len(issues)}", flush=True)
    print(f"before_matches={len(before)}", flush=True)
    print(f"candidate_updates={len(candidates)}", flush=True)

    updated = []
    failed = []

    for idx, (num, title, new_body) in enumerate(candidates, start=1):
        ok = False
        err = ""
        for attempt in range(1, 4):
            try:
                r = patch_issue_body(num, new_body)
                if r.returncode == 0:
                    ok = True
                    break
                err = (r.stderr or r.stdout).strip().replace("\n", " | ")
            except subprocess.TimeoutExpired:
                err = "PATCH request timed out"
            time.sleep(1.5 * attempt)

        if ok:
            updated.append(num)
        else:
            failed.append({"number": num, "title": title, "error": err})

        if idx % 10 == 0 or idx == len(candidates):
            progress_line = (
                f"progress={idx}/{len(candidates)} updated={len(updated)} failed={len(failed)}"
            )
            log.append(progress_line)
            print(progress_line, flush=True)

    issues_after = fetch_all_issues()
    after_matches = [i for i in issues_after if CHECK_RE.search(i.get("body") or "")]
    log.append(f"after_matches={len(after_matches)}")
    if after_matches:
        for i in after_matches[:50]:
            log.append(f"REMAIN #{i['number']} [{i['state']}] {i['title']}")

    result = {
        "total_issues": len(issues),
        "before_matches": len(before),
        "candidate_updates": len(candidates),
        "updated_count": len(updated),
        "failed_count": len(failed),
        "after_matches": len(after_matches),
        "updated_numbers": updated,
        "failed": failed,
        "remaining_numbers": [i["number"] for i in after_matches],
    }

    LOG.write_text("\n".join(log) + "\n")
    RES.write_text(json.dumps(result, indent=2) + "\n")

    print(f"wrote {LOG}")
    print(f"wrote {RES}")
    print(
        json.dumps(
            {
                "before_matches": result["before_matches"],
                "candidate_updates": result["candidate_updates"],
                "updated_count": result["updated_count"],
                "failed_count": result["failed_count"],
                "after_matches": result["after_matches"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
