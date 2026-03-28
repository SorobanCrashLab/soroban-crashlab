# Release Process

This guide defines the release workflow for Soroban CrashLab. Follow it when you need to cut a tagged release, publish release notes, and confirm whether the change set is backward compatible.

## Release policy at a glance

- Release from `main` only.
- Tag releases with semantic-version tags in the form `vMAJOR.MINOR.PATCH`.
- Keep [`CHANGELOG.md`](../CHANGELOG.md) current on every release.
- Treat `contracts/crashlab-core` public APIs, persisted JSON schemas, CLI behavior, and documented maintainer workflows as compatibility-sensitive surfaces.
- If a change is breaking, document the impact and migration steps in both the changelog and the GitHub release notes before tagging.

## Roles and prerequisites

A release maintainer should have:

- push permission for the repository
- a clean local checkout of `main`
- Git configured locally
- Node.js, npm, Rust, and Cargo installed so the standard checks can run

Optional but recommended:

- GitHub CLI (`gh`) authenticated for creating the GitHub release in one command

## 1. Prepare the release candidate

1. Sync your local checkout:

   ```bash
   git checkout main
   git pull upstream main
   ```

2. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

3. Review merged PRs and commits since the last tag so you know what belongs in the release:

   ```bash
   git tag --sort=-creatordate | head
   git log --oneline <last-tag>..main
   ```

4. Decide the next version number:
   - `PATCH`: fixes, docs-only updates, or internal changes with no intended external behavior change
   - `MINOR`: additive user-visible features, new CLI flags, new documented workflows, or new persisted fields that remain backward compatible
   - `MAJOR`: breaking changes to public APIs, persisted formats, CLI expectations, or maintainer workflows that require consumers to change behavior

If the repository is still pre-`1.0.0`, keep the same rule: use a major bump whenever downstream users or maintainers must change how they interact with the project.

## 2. Run the compatibility review

Before tagging, inspect the release candidate against these questions:

- Did `contracts/crashlab-core` add, remove, or rename public types, functions, or exported modules?
- Did any JSON or bundle format change schema, required fields, or serialization behavior?
- Did any CLI command change exit codes, arguments, default paths, or output formats that scripts may depend on?
- Did the web dashboard or maintainer workflow change in a way that affects documented operating steps?

Use this decision rule:

- Backward compatible: existing documented workflows, persisted artifacts, and common automation continue to work without modification
- Breaking: an existing consumer, replay bundle, script, or maintainer workflow needs a code or process change to keep working

When a breaking change is required:

1. Add a `Breaking changes` entry to [`CHANGELOG.md`](../CHANGELOG.md).
2. Describe the impact, the affected surface, and the migration path.
3. Mention the same migration note in the GitHub release description.
4. Bump the release version accordingly.

If you cannot explain the migration in a few concrete steps, the release is not ready to tag.

## 3. Update the changelog

Edit [`CHANGELOG.md`](../CHANGELOG.md) on `main` immediately before tagging.

1. Replace the placeholder `None` entries in `Unreleased` with the actual changes being shipped.
2. Group changes under `Added`, `Changed`, `Fixed`, and `Breaking changes`.
3. Move those entries into a new version heading using the release date:

   ```md
   ## v0.4.0 - 2026-03-28
   ```

4. Re-create an empty `Unreleased` section at the top so ongoing work has a place to accumulate notes.

Changelog entries should answer:

- what changed
- who is affected
- whether action is required after upgrading

## 4. Run release validation

Run the standard repo checks from the release commit:

```bash
cd apps/web
npm ci
npm run lint
npm run build

cd ../../contracts/crashlab-core
cargo test --all-targets
```

Also verify the release docs are free of unresolved placeholders:

```bash
grep -n "TODO\\|TBD" README.md CONTRIBUTING.md MAINTAINER_WAVE_PLAYBOOK.md docs/RELEASE_PROCESS.md CHANGELOG.md || true
```

Do not tag a release with failing checks unless you intentionally document an exception in the release notes and a maintainer approves that risk.

## 5. Tag the release

Create an annotated tag from the reviewed `main` commit:

```bash
git checkout main
git pull upstream main
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push upstream vX.Y.Z
```

If you maintain from a fork, push the tag to the canonical upstream repository, not only your fork.

## 6. Publish the GitHub release

Use the tag plus the changelog summary to publish release notes.

With GitHub CLI:

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file RELEASE_NOTES.md
```

Or use the GitHub web UI and paste the same summary manually.

The release notes should include:

- a short summary of the release
- the main Added/Changed/Fixed items
- any breaking changes and migration steps
- the verification commands you ran

## 7. Post-release follow-up

After publishing:

1. Confirm the tag is visible on GitHub.
2. Confirm the release notes match [`CHANGELOG.md`](../CHANGELOG.md).
3. Leave `main` ready for future work with a fresh `Unreleased` section.
4. If the release introduced a new schema version or compatibility expectation, update any related docs in `README.md` or `docs/REPRODUCIBILITY.md` in the same PR.

## Release checklist

Use this condensed checklist if you already know the workflow:

```text
[ ] Checkout clean main and pull latest upstream
[ ] Review commits since the last tag
[ ] Decide the next semantic version
[ ] Run the backward-compatibility review
[ ] Update CHANGELOG.md with release notes and migration guidance
[ ] Run web and Rust validation commands
[ ] Verify docs contain no TODO/TBD placeholders
[ ] Create and push annotated tag
[ ] Publish GitHub release notes
[ ] Restore an empty Unreleased section
```
