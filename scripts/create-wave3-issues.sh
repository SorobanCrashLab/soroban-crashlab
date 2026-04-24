#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ISSUE_FILE="$ROOT_DIR/ops/wave3-issues.tsv"
REPO="SorobanCrashLab/soroban-crashlab"

have_gh=0
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    have_gh=1
  fi
fi

token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

if [ "$have_gh" -eq 0 ] && [ -z "$token" ]; then
  echo "No authenticated publisher available. Install gh and auth, or set GH_TOKEN/GITHUB_TOKEN." >&2
  exit 1
fi

api_call() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"

  if [ -n "$token" ]; then
    if [ -n "$data" ]; then
      curl -sS --retry 3 --retry-delay 1 --retry-all-errors -X "$method" \
        -H "Authorization: Bearer $token" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com$endpoint" \
        -d "$data"
    else
      curl -sS --retry 3 --retry-delay 1 --retry-all-errors -X "$method" \
        -H "Authorization: Bearer $token" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com$endpoint"
    fi
    return
  fi

  if [ -n "$data" ]; then
    gh api --method "$method" "$endpoint" --input - <<<"$data"
  else
    gh api --method "$method" "$endpoint"
  fi
}

json_escape() {
  sed -e ':a' -e 'N' -e '$!ba' -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\n/\\n/g'
}

url_encode_title() {
  sed -e 's/%/%25/g' -e 's/ /%20/g' -e 's/"/%22/g' -e 's/#/%23/g' -e 's/&/%26/g' -e 's/?/%3F/g'
}

bash "$ROOT_DIR/scripts/bootstrap-wave3-labels.sh" --repo "$REPO"

echo "Publishing curated issues from $ISSUE_FILE"

tail -n +2 "$ISSUE_FILE" | while IFS='|' read -r title complexity area type summary acceptance; do
  [ -z "$title" ] && continue

  if [ "$have_gh" -eq 1 ]; then
    exists="$(gh issue list --repo "$REPO" --search "\"$title\" in:title" --limit 100 --json title --jq '.[].title' | grep -Fxc "$title" || true)"
  else
    encoded_title=$(printf '%s' "$title" | url_encode_title)
    exists_resp=$(api_call GET "/search/issues?q=repo:$REPO+is:issue+state:open+in:title+\"$encoded_title\"&per_page=5")
    exists="$(printf '%s' "$exists_resp" | grep -Fxc '"title": "'"$title"'"' || true)"
  fi
  if [ "$exists" -gt 0 ]; then
    echo "Skipping existing issue: $title"
    continue
  fi

  body=$(cat <<EOF
## Goal
$summary

## Area
$area

## Complexity
$complexity

## Acceptance criteria
- $acceptance

## Maintainer note
- This issue is part of the Wave 3 curated backlog and should remain scoped.
EOF
)

  if [ "$have_gh" -eq 1 ]; then
    gh issue create \
      --repo "$REPO" \
      --title "$title" \
      --body "$body" \
      --label "wave3" \
      --label "complexity:$complexity" \
      --label "$area" \
      --label "$type"
  else
    body_json=$(printf '%s' "$body" | json_escape)
    title_json=$(printf '%s' "$title" | json_escape)
    payload=$(printf '{"title":"%s","body":"%s","labels":["wave3","complexity:%s","%s","%s"]}' "$title_json" "$body_json" "$complexity" "$area" "$type")
    api_call POST "/repos/$REPO/issues" "$payload" >/dev/null
  fi

  echo "Created issue: $title"
done

echo "Done."
