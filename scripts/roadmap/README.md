# Roadmap issue automation

Generates **140** non-overlapping GitHub issues (135 code + 5 documentation).

## Generate catalog

```bash
python3 scripts/roadmap/generate_catalog.py
# -> scripts/roadmap/issues.json
```

## Publish to GitHub

Requires a valid `GH_TOKEN` (classic PAT or fine-grained) with `repo` scope on `SorobanCrashLab/soroban-crashlab`.

```bash
unset GITHUB_TOKEN   # avoid conflicting with gh keyring
export GH_TOKEN='ghp_...'   # do not commit

chmod +x scripts/roadmap/create_labels.sh scripts/roadmap/create_github_issues.sh
./scripts/roadmap/create_labels.sh
./scripts/roadmap/create_github_issues.sh
```

Issues are created **last five = documentation** (milestone `P5 Documentation`).

## Contributor PR policy

- Branch: `issue/<roadmap-id>-<slug>` (e.g. `issue/042-api-get-runs`)
- One issue per PR
- Do not edit `pnpm-lock.yaml` or `package-lock.json`
- `package.json` changes require maintainer approval note in PR
