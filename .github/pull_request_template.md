## Summary

<!-- One sentence summary. Include ROADMAP-XXX or GitHub issue number. -->

Closes #

## Checklist

- [ ] CI is green (all checks pass)
- [ ] Branch name follows `issue/<number>-<slug>`
- [ ] Scope limited to files listed in the issue
- [ ] Tests added or updated
- [ ] Docs updated (if user-facing behavior changed)
- [ ] `pnpm-lock.yaml` / `package-lock.json` **not** modified
- [ ] If `package.json` changed: maintainer approval requested below

## Maintainer approval (package.json only)

<!-- Delete this section if package.json unchanged -->

- Required dependency change explained:

## Test plan

<!-- Steps to verify. Paste output of relevant verification commands. -->

<!--
PR titles are validated by the `lint-title` job (see .github/workflows/semantic-pr.yml).
The title must look like "type: subject" or "type(scope): subject" where:
  - type is one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
  - the subject starts with a lowercase letter
  - the subject does not end with a period

For this change use exactly:

    build: unify crates under a cargo workspace
-->
