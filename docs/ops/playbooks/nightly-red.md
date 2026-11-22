# Playbook: mass nightly red

Several scheduled workflows fail on the same night. Default severity
**SEV3** for one red job, **SEV2** when the nightly evidence is red across
the board (nothing downstream can trust last night's results).

## Symptoms

- Auto-issue `Nightly fuzz campaign: regression suite failed` (fuzz-campaign.yml).
- Auto-issue `CI failure: storage-driver-minio nightly` (storage-minio.yml).
- Other scheduled workflows red in the Actions tab on the same date.

## Triage order

Work from the most shared cause to the least, and stop at the first hit:

1. **Platform:** GitHub Actions incident? runner image changed? (`githubstatus.com`,
   the job's "Set up job" step shows the image version.)
2. **Dependencies:** a toolchain or action update landed (`rust-toolchain`,
   Dependabot merges, `pnpm-lock.yaml` changes since the last green night).
3. **Shared infrastructure:** registry/image pulls, secrets expired or rotated.
4. **Main branch changes:** `git log <last-green-sha>..<first-red-sha>`.
5. **Genuine regressions:** a fixture that used to pass now fails — that is
   the product working; triage it as a crash, not as an incident.

## Verify

Re-run one failed job once. Green on re-run → flaky (note it; see W5-D07
quarantine, #1825). Red again → bisect with step 4.

## Mitigate

- Platform/dependency cause: pin back or wait out the incident; re-run.
- Main-branch cause: revert the offending commit rather than fixing forward
  under pressure.
- Keep one tracking issue; close the per-job auto-issues with a link to it.

## Verify recovery

The next scheduled run of every affected workflow is green (not just a re-run).

## Post-incident

SEV2: postmortem. Add the missing signal (e.g. dependency pin) so the same
cause is caught before the nightly.
