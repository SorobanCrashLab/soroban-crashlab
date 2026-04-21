#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_ISSUE_FILE="$ROOT_DIR/ops/wave4-canonical.tsv"
LEGACY_ISSUE_FILE="$ROOT_DIR/ops/wave4-issues.tsv"
ISSUE_FILE="${WAVE4_ISSUE_FILE:-$DEFAULT_ISSUE_FILE}"
REPO="SorobanCrashLab/soroban-crashlab"

if [ ! -f "$ISSUE_FILE" ]; then
  if [ -z "${WAVE4_ISSUE_FILE:-}" ] && [ -f "$LEGACY_ISSUE_FILE" ]; then
    ISSUE_FILE="$LEGACY_ISSUE_FILE"
    echo "Canonical backlog not found; falling back to legacy file: $ISSUE_FILE"
  else
    echo "Issue file not found: $ISSUE_FILE" >&2
    exit 1
  fi
fi

if rg -n "^(<<<<<<<|=======|>>>>>>>)" "$ISSUE_FILE" >/dev/null 2>&1; then
  echo "Issue file has unresolved merge markers: $ISSUE_FILE" >&2
  exit 1
fi

duplicate_titles="$(awk -F'|' 'NR > 1 { gsub(/^ +| +$/, "", $1); if ($1 != "") c[$1]++ } END { for (k in c) if (c[k] > 1) print k }' "$ISSUE_FILE")"
if [ -n "$duplicate_titles" ]; then
  echo "Issue file has duplicate titles; resolve before publishing:" >&2
  printf '%s\n' "$duplicate_titles" >&2
  exit 1
fi

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

label_value() {
  local value="$1"
  echo "${value#*:}"
}

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

build_issue_body() {
  local title="$1"
  local complexity="$2"
  local area="$3"
  local type="$4"
  local summary="$5"
  local acceptance="$6"

  local area_value
  local type_value
  local complexity_value
  local branch_prefix
  local branch_slug
  local context_line
  local implementation_focus
  local risk_line
  local dependency_line
  local area_validation
  local complexity_expectation
  local qa_expectation

  area_value="$(label_value "$area")"
  type_value="$(label_value "$type")"
  complexity_value="${complexity^}"
  branch_slug="$(slugify "$title")"

  case "$type_value" in
    bug) branch_prefix="fix" ;;
    task) branch_prefix="chore" ;;
    *) branch_prefix="feat" ;;
  esac

  qa_expectation="Include unit tests for the primary behavior and at least one failure/edge case."
  complexity_expectation="Keep scope tightly focused to this issue and defer extras to follow-up tickets."

  case "$area_value" in
    web)
      context_line="This impacts dashboard usability and triage flow quality for maintainers and contributors."
      implementation_focus="Implement the UI behavior end-to-end, including explicit loading/error states, keyboard accessibility, and responsive layout behavior where relevant."
      risk_line="Inconsistent UX states can create triage confusion and reduce trust in run/crash signals."
      dependency_line="Coordinate with existing dashboard modules and shared type contracts before final UI wiring."
      area_validation="cd apps/web && npm run lint && npm run build"
      ;;
    fuzzer)
      context_line="This affects mutation quality, deterministic exploration, and failure discovery efficiency."
      implementation_focus="Implement deterministic seed and mutator behavior, and cover malformed/boundary input edge cases with focused tests."
      risk_line="Non-deterministic mutation behavior can invalidate replay confidence and benchmark comparisons."
      dependency_line="Keep output compatibility with existing bundle, replay, and taxonomy paths."
      area_validation="cd contracts/crashlab-core && cargo test --all-targets"
      ;;
    runtime)
      context_line="This affects replay reliability, run integrity, and operational stability during active campaigns."
      implementation_focus="Handle failure paths explicitly (timeouts, retries, cancellation where applicable) and keep outputs reproducible across reruns."
      risk_line="Weak runtime controls can produce partial results and hard-to-debug campaign failures."
      dependency_line="Preserve compatibility with replay, bundle persistence, and health reporting interfaces."
      area_validation="cd contracts/crashlab-core && cargo test --all-targets"
      ;;
    generator)
      context_line="This affects reproducible fixture generation, regression confidence, and triage signal quality."
      implementation_focus="Ensure exported artifacts remain stable and deterministic, with focused regression validation for expected failure signatures."
      risk_line="Unstable fixture generation can introduce flaky CI and noisy crash grouping."
      dependency_line="Validate schema/version assumptions against current fixture loaders and sanitization rules."
      area_validation="cd contracts/crashlab-core && cargo test --all-targets"
      ;;
    security)
      context_line="This affects project trust boundaries, disclosure posture, and maintainer response quality."
      implementation_focus="Document and enforce the intended security control path clearly, including known risks and mitigation boundaries."
      risk_line="Ambiguous security processes increase response latency and operational risk during incidents."
      dependency_line="Align with SECURITY.md, CONTRIBUTING.md, and MAINTAINER_WAVE_PLAYBOOK.md language and timelines."
      area_validation="rg -n \"TODO|TBD\" README.md CONTRIBUTING.md MAINTAINER_WAVE_PLAYBOOK.md .github/SECURITY.md || true"
      ;;
    ops)
      context_line="This affects backlog hygiene, triage throughput, and maintainer workflow reliability."
      implementation_focus="Automate or codify the workflow with clear ownership, repeatability, and low manual ambiguity."
      risk_line="Operational ambiguity causes stale backlog states and inconsistent review throughput."
      dependency_line="Ensure workflows/scripts remain idempotent and safe for repeated runs in CI and local contexts."
      area_validation="bash -n scripts/*.sh"
      ;;
    docs)
      context_line="This affects contributor onboarding speed and maintainer execution consistency."
      implementation_focus="Write actionable docs with command-level examples and enough context for first-time contributors to execute confidently."
      risk_line="Incomplete docs increase review ping-pong and delay contributor throughput."
      dependency_line="Cross-link related docs so workflows remain discoverable from README and maintainer guides."
      area_validation="rg -n \"TODO|TBD\" README.md CONTRIBUTING.md MAINTAINER_WAVE_PLAYBOOK.md docs/*.md || true"
      ;;
    integration)
      context_line="This affects cross-system reliability and confidence in end-to-end behavior."
      implementation_focus="Implement and verify integration boundaries with deterministic setup, observable failures, and explicit success criteria."
      risk_line="Integration drift can silently break replay or issue-link workflows across services."
      dependency_line="Document required env/config contracts and failure behavior for external dependencies."
      area_validation="cd apps/web && npm run lint && npm run build"
      ;;
    *)
      context_line="This issue is part of the Wave 4 roadmap and should be implemented with production-grade quality."
      implementation_focus="Implement the change end-to-end and include tests for primary and edge paths."
      risk_line="Unclear implementation boundaries can create regressions in adjacent modules."
      dependency_line="Call out direct dependencies in the PR description and issue thread."
      area_validation=""
      ;;
  esac

  case "$complexity" in
    high)
      complexity_expectation="Include a short design note in the PR (tradeoffs, alternatives considered, and rollback path)."
      qa_expectation="Include unit tests plus at least one integration/regression path for cross-module behavior."
      ;;
    medium)
      complexity_expectation="Keep implementation modular and avoid coupling unrelated concerns in one PR."
      qa_expectation="Include unit tests for core behavior and one meaningful edge case."
      ;;
    *)
      complexity_expectation="Keep implementation simple and avoid introducing new abstractions unless required."
      qa_expectation="Include at least one focused test proving the acceptance path."
      ;;
  esac

  cat <<EOF
Type: ${type_value^^}

Overview
$summary

Context
- Area: $area ($area_value)
- Complexity: $complexity_value
- $context_line
- Risk note: $risk_line

What to implement
- [ ] $implementation_focus
- [ ] Ensure configuration/behavior can be verified without manual guesswork.
- [ ] Keep scope aligned to this issue; move optional enhancements to follow-up tasks.
- [ ] Dependency note: $dependency_line

Implementation Tasks
- [ ] Add or update tests for the primary flow plus failure/edge behavior.
- [ ] $qa_expectation
- [ ] Preserve existing behavior outside this issue scope.

Acceptance Criteria
- [ ] $acceptance
- [ ] Validation steps are included in the PR description and reproducible by a maintainer.
- [ ] No regressions are introduced in adjacent Wave 4 flows.

Definition of Done
- [ ] Implementation is complete and merge-ready (no placeholder logic).
- [ ] Tests are passing locally and in CI for impacted surfaces.
- [ ] Reviewer can verify behavior without guesswork.
- [ ] PR description includes Closes #<issue-number>.
- [ ] $complexity_expectation

Suggested Validation
- Primary: $area_validation
- Secondary: run only affected module checks and include command output summary in PR.

PR and Checkout (Suggested)
- git checkout -b ${branch_prefix}/wave4-${branch_slug}
- git commit -m "${branch_prefix}: ${title}"
- git push origin ${branch_prefix}/wave4-${branch_slug}

Maintainer Notes
- Keep this issue scoped; split follow-up work into linked issues when needed.
- If blocked, document blockers clearly and link dependencies in the issue thread.
EOF
}

bash "$ROOT_DIR/scripts/bootstrap-wave4-labels.sh" --repo "$REPO"

echo "Publishing curated issues from $ISSUE_FILE"

while IFS='|' read -r title complexity area type summary acceptance status _rest; do
  [ -z "$title" ] && continue

  if [ "${status,,}" = "implemented" ]; then
    echo "Skipping implemented backlog entry: $title"
    continue
  fi

  if [ "$have_gh" -eq 1 ]; then
    exists="$(gh issue list --repo "$REPO" --search "\"$title\" in:title" --limit 100 --json title --jq '.[].title' < /dev/null | grep -Fxc "$title" || true)"
  else
    encoded_title=$(printf '%s' "$title" | url_encode_title)
    exists_resp=$(api_call GET "/search/issues?q=repo:$REPO+is:issue+state:open+in:title+\"$encoded_title\"&per_page=5")
    exists="$(printf '%s' "$exists_resp" | grep -Fxc '"title": "'"$title"'"' || true)"
  fi
  if [ "$exists" -gt 0 ]; then
    echo "Skipping existing issue: $title"
    continue
  fi

  body="$(build_issue_body "$title" "$complexity" "$area" "$type" "$summary" "$acceptance")"

  if [ "$have_gh" -eq 1 ]; then
    gh issue create \
      --repo "$REPO" \
      --title "$title" \
      --body "$body" \
      --label "wave4" \
      --label "complexity:$complexity" \
      --label "$area" \
      --label "$type" < /dev/null
  else
    body_json=$(printf '%s' "$body" | json_escape)
    title_json=$(printf '%s' "$title" | json_escape)
    payload=$(printf '{"title":"%s","body":"%s","labels":["wave4","complexity:%s","%s","%s"]}' "$title_json" "$body_json" "$complexity" "$area" "$type")
    api_call POST "/repos/$REPO/issues" "$payload" >/dev/null
  fi

  echo "Created issue: $title"
done < <(tail -n +2 "$ISSUE_FILE")

echo "Done."
