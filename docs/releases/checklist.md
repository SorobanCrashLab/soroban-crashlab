# Release checklist

Policy: [`policy.md`](policy.md). Workflow:
[`.github/workflows/release.yml`](../../.github/workflows/release.yml).

## Pre-release

- [ ] `main` is green; no open `severity:critical` issues targeted at this release.
- [ ] Preview the changelog and decide the version per the
      [surface table](policy.md#surfaces):
      `node scripts/release/changelog.mjs --from <last-tag>`.
- [ ] Dry run: **Actions → release → Run workflow** with `dry_run: true`.
      Check the `release-draft` artifact: notes, SBOM, fixture-compat evidence.
- [ ] Fixture-compat evidence is ✅; if not, the release is breaking.
- [ ] Baselines refreshed (regression suite, bundle-size, Lighthouse) if the
      release intentionally moves them.
- [ ] Migration scripts for any persisted schema bump are merged and
      documented; N-1 readers still pass.
- [ ] Deprecations announced in this release are listed, with their removal release.
- [ ] Upgrade note written (`docs/releases/upgrade-notes/vX.Y.Z.md` from the
      [template](upgrade-notes/TEMPLATE.md)) if anything is breaking or deprecated.

## Release

- [ ] Signed tag on the reviewed `main` commit:
      ```bash
      git tag -s vX.Y.Z -m "vX.Y.Z"
      git tag -v vX.Y.Z
      git push upstream vX.Y.Z
      ```
- [ ] The `release` workflow on the tag is green: changelog, fixture-compat,
      image built + SBOM (+ signature once enabled), draft release created.
- [ ] Edit the draft: paste the upgrade note, summary on top; publish.
- [ ] Commit the release section into `CHANGELOG.md`
      (`node scripts/release/changelog.mjs --from <last-tag> --to vX.Y.Z --version vX.Y.Z --date <YYYY-MM-DD>`,
      under a fresh `Unreleased`).

## Post-release

- [ ] Announce (GitHub release + Discussions/Discord) with the upgrade note link.
- [ ] From a clean machine, follow the README/GETTING_STARTED install and the
      image verification below; fix any step that fails.
- [ ] Open issues for every deprecation removal scheduled for the next release.

### Verifying a release image (once signing is enabled)

```bash
cosign verify ghcr.io/sorobancrashlab/soroban-crashlab-web:vX.Y.Z \
  --certificate-identity-regexp 'https://github.com/SorobanCrashLab/soroban-crashlab/.github/workflows/release.yml@refs/tags/v.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## One-time maintainer setup

Blocked on maintainers — not done by the PR that added this checklist:

1. **Tag signing**: each release maintainer registers a GPG or SSH signing key
   on GitHub; consider a tag protection rule for `v*`.
2. **Image push + keyless signing**: allow the workflow's `GITHUB_TOKEN` to
   write packages (org settings) — cosign uses GitHub OIDC, no key to manage.
3. When both work on a real release, set the repository variable
   `RELEASE_ENFORCE_SIGNING=true` so unsigned tags and signing failures fail
   the workflow instead of warning.
