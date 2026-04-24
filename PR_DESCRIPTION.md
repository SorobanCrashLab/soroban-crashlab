# feat: Add conflict-of-interest maintainer policy

Closes #437 
## Summary

Defines the conflict-of-interest control path for issue assignment, PR review, merge, security triage, disclosure, and resolution-credit decisions. The policy is documented in the security policy and maintainer playbook, with contributor guidance for raising known conflicts without leaking private vulnerability details.

## What changed

- Added conflict-of-interest handling to `.github/SECURITY.md`, including required recusal path, timelines, risks, and mitigation boundaries.
- Linked the policy from `MAINTAINER_WAVE_PLAYBOOK.md` and documented the maintainer verification command.
- Added contributor disclosure guidance to `CONTRIBUTING.md`.
- Added `maintainer-conflict-policy.ts` with a pure policy evaluator for allowed decisions, recusal-required decisions, SLA timelines, and handle-normalization edge cases.
- Added focused policy tests and wired them into `npm run test` plus CI.

## Validation

```bash
rg -n "TODO|TBD" README.md CONTRIBUTING.md MAINTAINER_WAVE_PLAYBOOK.md .github/SECURITY.md || true
```

Expected: no unresolved placeholder output.

```bash
cd apps/web
npm run test:policy
npm run test
```

Expected: policy checks pass, including primary allowed flow, conflict recusal flow, security-triage edge behavior, and documentation cross-links.

```bash
cd apps/web
npm run lint
npm run build
```

Expected: frontend lint/build remain green for impacted surfaces.

## Local Output Summary

- `rg -n "TODO|TBD" README.md CONTRIBUTING.md MAINTAINER_WAVE_PLAYBOOK.md .github/SECURITY.md || true`: no output.
- `jq empty apps/web/package.json`: passed.
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml"); puts "ci yaml ok"'`: `ci yaml ok`.
- `npm run test:policy`, `npm run test`, `npm run lint`, and `npm run build`: not executed in this local shell because `node` and `npm` are unavailable (`which node` and `which npm` returned not found). CI now runs `npm run test` between lint and build.

## Notes for Maintainers

The automated policy check validates documented timers and handle-based self-assignment/self-review conflicts. It does not detect private employment, sponsor, financial, or close-collaboration relationships; those still require self-disclosure and reviewer escalation per the policy.
