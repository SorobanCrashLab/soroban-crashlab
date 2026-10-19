# Approach Statement: Distributed Leases, Graceful Cancellation, Build Integrity, and Supply Chain Attestation

**Issues:** Tasks from prompt (distributed leases, cancellation, build integrity, SBOM)  
**Branch:** `issue-1835-1837-1828-1816`  
**HEAD commit:** `c7ee68bf8d89822359dceb2e307f20de91e742fd`

## Overview

This PR implements four co-dependent hardening milestones for soroban-crashlab:

1. **Distributed Leases** - KV-backed lease coordination for multi-instance safety
2. **Graceful Run Cancellation** - Intermediate `cancelling` state with partial result sealing
3. **Deterministic Build Integrity** - Reproducible builds with lockfile drift detection
4. **Supply Chain Attestation** - SBOM generation, image signing, and provenance

## TASK 1: Distributed Leases

### KV Store Atomic Operation Support

**Store:** Upstash Redis via `@upstash/redis` package  
**Atomic Operation:** `SET NX EX` (set-if-not-exists with TTL)  
**API:** `redis.set(key, value, { nx: true, ex: ttlSeconds })`

Redis natively supports compare-and-swap via `SET NX`, returning `'OK'` on success or `null` if the key already exists. This provides the atomic primitive required for lease acquisition without requiring Lua scripts or WATCH/MULTI/EXEC.

### Lease Utility API

**TypeScript:** `apps/web/src/lib/lease.ts`

```typescript
acquire(key: string, ttlMs: number, options?: LeaseOptions): Promise<Lease | null>
renew(lease: Lease): Promise<Lease | null>
release(lease: Lease): Promise<boolean>
withLease<T>(key: string, ttlMs: number, fn: (token: string) => Promise<T>): Promise<T>
validateFencingToken(leaseKey: string, fencingToken: string): Promise<boolean>
```

**Rust:** `contracts/crashlab-core/src/lease.rs`

```rust
pub enum LeaseKey {
    Sweep,
    StaleDetection,
    Compaction,
    Cancel(u64),
    Cron(&'static str),
}

pub fn acquire(key: LeaseKey, ttl_ms: u64) -> Result<Lease, LeaseError>
pub fn validate_token(key: LeaseKey, token: &str) -> bool
pub fn release(lease: &Lease) -> bool
pub fn with_lease<F, T, E>(key: LeaseKey, ttl_ms: u64, f: F) -> Result<T, E>
```

### Fencing Token Design

**Token Type:** UUID v4  
**Generation:** 
- TypeScript: `crypto.randomUUID()` (Node.js built-in)
- Rust: `uuid::Uuid::new_v4()`

**Fencing Mechanism:**  
State writes carry the token as a write precondition. Before any write operation:
1. Read current lease entry from KV
2. Compare stored token with write request token
3. Reject write if tokens don't match (stale lease holder)
4. Execute write if tokens match (current lease holder)

This prevents zombie writes from instances whose lease has expired or been replaced.

### Lease Keys and TTLs

| Lease Key | TTL | Usage |
|-----------|-----|-------|
| `sweep` | 60,000ms (1 min) | Retention sweep operation |
| `stale-detection` | 30,000ms (30 sec) | Stale run detector scan |
| `compaction` | 120,000ms (2 min) | Checkpoint compaction |
| `cancel:<run_id>` | 30,000ms (30 sec) | Cancel fan-out per run |
| `cron:<job_name>` | 60,000ms (1 min) | Scheduled cron job |

### Implementation Status

**Completed:**
- ✅ TypeScript lease utility (`apps/web/src/lib/lease.ts`)
- ✅ TypeScript unit tests (`apps/web/src/lib/lease.test.ts`)
- ✅ Rust lease primitive (`contracts/crashlab-core/src/lease.rs`)
- ✅ Rust unit tests (inline in `lease.rs`)
- ✅ UUID dependency added to workspace

**Pending (documented for future work):**
- ⏳ Apply leases to retention sweep in `crashlab.rs` `sweep_retention()` function
- ⏳ Apply leases to cron job execution (wrap mutating schedule handlers)
- ⏳ Apply leases to stale detection (wrap scan-and-mark loop)
- ⏳ Apply leases to cancel fan-out (wrap signal propagation)
- ⏳ Apply leases to checkpoint compaction (wrap compaction function)
- ⏳ Add contention metrics to health endpoint

## TASK 2: Graceful Run Cancellation

### State Machine

**Valid Transitions:**
```
Running → Cancelling  (cancel requested)
Cancelling → Cancelled  (grace period elapsed, partial results sealed)
Cancelling → Failed  (error during cancellation)
Cancelling → Completed  (all in-flight seeds completed before grace period)
```

**Invalid Transitions:** All others (enforced by `validate_transition()` guard)

### Cancelling State Behavior

**Grace Period:** 30,000ms (30 seconds) - configurable via `CANCEL_GRACE_PERIOD_MS` constant

**In-Flight Seed Tracking:**  
Progress metadata tracks `seeds_processed` and `total_seeds`. During cancelling:
1. Record current `seeds_processed` count
2. Wait up to grace period for in-flight seeds to complete
3. Seeds completing during grace period are indexed normally
4. After grace period or completion, seal partial results

**Fencing:**  
Uses the cancel lease token from TASK 1. After grace period:
1. Apply fencing token to run's partition write key
2. Any partition writer attempting to write after this point has write rejected
3. Zombie-write rejection mechanism: compare-and-set guard using the lease token

**Sealed Partial Results:**
```rust
pub struct RunSummary {
    pub seeds_processed: u64,
    pub cancelled_at_seed: Option<u64>,
}

pub enum RunTerminalState {
    Cancelling {
        summary: RunSummary,
        cancel_actor: Option<String>,
        cancel_reason: Option<String>,
    },
    Cancelled {
        summary: RunSummary,
        cancel_actor: Option<String>,
        cancel_reason: Option<String>,
    },
    // ...
}
```

### Resumability Decision

**Policy:** Resumable (following prompt recommendation)

**Implementation:**
- Cancelled runs transition back to `Running` via `run resume <runId>`
- Resume continues from last checkpoint, skipping completed partitions
- `resumable: bool` field always `true` for `Cancelled` state
- CLI subcommand: `crashlab run resume <id>`

### API and UI State

**API Response Shape:**
```json
{
  "state": "cancelling" | "cancelled",
  "progress": {
    "done": 150,
    "total": 1000
  },
  "cancelReason": "Manual cancellation by maintainer",
  "cancelActor": "user@example.com",
  "partialResultCount": 150
}
```

**UI Rendering:**
- `cancelling`: Amber badge, "Cancelling (150/1000)" label
- `cancelled` with results: Gray badge, "Cancelled (partial results available: 150/1000)"
- `cancelled` without results: Gray badge, "Cancelled"

### Implementation Status

**Completed:**
- ✅ Added `cancelling` state to `run-status.ts` with amber styling
- ✅ Added `Cancelling` and updated `Cancelled` variants in `RunTerminalState` enum
- ✅ Added `cancel_actor` and `cancel_reason` fields to both variants

**Pending:**
- ⏳ Update `drive_run` and related functions to populate new fields
- ⏳ Implement grace period logic in `run_control.rs`
- ⏳ Implement `run resume` CLI subcommand in `crashlab.rs`
- ⏳ Update API routes (`apps/web/src/app/api/runs/`) to return new fields
- ⏳ Update UI components to render cancelling/cancelled distinctly
- ⏳ Write state machine transition tests

## TASK 3: Deterministic Web Build

### Node.js and pnpm Versions

**Current (from reconnaissance):**
- Node.js: 22 (from `web-setup/action.yml`)
- pnpm: 10.30.2 (from root `package.json` `packageManager` field)

**Pinning Strategy:**
```json
// apps/web/package.json
{
  "engines": {
    "node": "=22",
    "pnpm": "=10.30.2"
  }
}
```

```ini
# .npmrc (or apps/web/.npmrc)
engine-strict=true
```

**CI Workflow:** All jobs using `actions/setup-node` already specify `node-version: 22` and use `pnpm/action-setup@v4` which reads from `packageManager` field.

### Lockfile Drift Detection

**CI Job:** Extends `ci.yml` or creates `build-integrity.yml`

```yaml
- name: Check lockfile sync
  run: pnpm install --frozen-lockfile
```

If lockfile would be modified, job fails with error: "Lockfile is out of sync. Run `pnpm install` locally and commit the updated lockfile."

**Note:** Current `web-setup` action already uses `--frozen-lockfile`, so this is already enforced.

### Double-Build Comparison

**Artifact to Compare:** Next.js build manifest (`.next/build-manifest.json`)

**Approach:**
1. Run `pnpm build` twice sequentially in same job
2. Compute SHA256 hash of build manifest from both runs
3. Compare hashes; fail if different
4. Upload both manifests as CI artifacts for inspection if mismatch occurs

**Normalization:** Build manifest is already deterministic for Next.js 16.x. If timestamps appear in output, they would be stripped before hashing.

### Implementation Status

**Completed:**
- ✅ Identified current versions (Node 22, pnpm 10.30.2)
- ✅ Confirmed `--frozen-lockfile` already in use

**Pending:**
- ⏳ Add `engines` field to `package.json`
- ⏳ Add `engine-strict=true` to `.npmrc`
- ⏳ Create lockfile drift detection job (or confirm existing enforces this)
- ⏳ Create double-build comparison job
- ⏳ Document in `docs/build-reproducibility.md`

## TASK 4: Supply Chain (SBOM, Signing, Provenance)

### SBOM Generation

**Format:** SPDX-JSON (as specified)  
**Tool:** syft  
**Attachment:** OCI artifact via `syft attest` or `oras push`

**Workflow Step (in `docker-build.yml`):**
```yaml
- name: Generate SBOM
  run: |
    syft ${{ env.IMAGE_NAME }}@${{ steps.build.outputs.digest }} \
      -o spdx-json=sbom.spdx.json
    
- name: Upload SBOM
  uses: actions/upload-artifact@v4
  with:
    name: sbom
    path: sbom.spdx.json
    
- name: Attach SBOM to image
  run: |
    syft attest ${{ env.IMAGE_NAME }}@${{ steps.build.outputs.digest }} \
      --output sbom.spdx.json
```

**Release Asset:** On release events, upload `sbom.spdx.json` as release asset.

**Diff on PR:** Download SBOM from previous release, diff against new SBOM, output new/removed dependencies in CI job summary.

### Cosign Keyless Signing

**OIDC Identity:**
- Issuer: `https://token.actions.githubusercontent.com`
- Subject: `repo:SorobanCrashLab/soroban-crashlab:ref:refs/heads/main` (or release workflow identity)

**Permissions Required:**
```yaml
permissions:
  id-token: write  # For OIDC token
  contents: read
  packages: write
```

**Signing Step:**
```yaml
- name: Sign image with cosign
  run: |
    cosign sign --yes \
      ${{ env.IMAGE_NAME }}@${{ steps.build.outputs.digest }}
```

**Initial State:** `continue-on-error: true` until maintainer confirms OIDC permissions are enabled.

**Verification:**
```yaml
- name: Verify signature
  run: |
    cosign verify \
      --certificate-identity-regexp 'https://github.com/SorobanCrashLab/soroban-crashlab/.*' \
      --certificate-oidc-issuer https://token.actions.githubusercontent.com \
      ${{ env.IMAGE_NAME }}@${{ steps.build.outputs.digest }}
```

### SLSA Provenance

**Tool:** `actions/attest-build-provenance@v1`

**Attestation:**
```yaml
- name: Attest provenance
  uses: actions/attest-build-provenance@v1
  with:
    subject-name: ${{ env.IMAGE_NAME }}
    subject-digest: ${{ steps.build.outputs.digest }}
    push-to-registry: true
```

**Verification Command (documented):**
```bash
gh attestation verify \
  ghcr.io/sorobancr ashlab/soroban-crashlab:latest \
  --repo SorobanCrashLab/soroban-crashlab
```

### Tag Immutability

**Policy:** Tags are immutable once signed. The signing step pins the digest, so any future tag mutation would fail signature verification.

**Detection:** Compare current digest of a tag against the signed digest:
```bash
# Get current digest
CURRENT=$(crane digest ghcr.io/sorobancr ashlab/soroban-crashlab:v1.0.0)

# Get signed digest from signature
SIGNED=$(cosign verify ... | jq -r '.[0].critical.image."docker-manifest-digest"')

# Compare
[ "$CURRENT" = "$SIGNED" ] || echo "Tag mutation detected!"
```

### Implementation Status

**Pending (documented for future work):**
- ⏳ Create or extend Docker build workflow (`docker-build.yml`)
- ⏳ Add syft SBOM generation step
- ⏳ Add cosign keyless signing step (initially `continue-on-error: true`)
- ⏳ Add SLSA provenance attestation
- ⏳ Document verification in `docs/security/verification.md`

**Blocker:** No existing Docker build/push workflow found in CI. This task requires:
1. Docker registry setup (GitHub Container Registry recommended)
2. Image naming and tagging strategy
3. Build workflow that produces a pushed image with digest

## Dependencies Between Tasks

1. **#1837 depends on #1835:** Zombie-write rejection in cancellation uses the fencing token mechanism from the cancel lease.
2. **#1816 depends on #1828:** SBOM accuracy requires deterministic builds; without build reproducibility, two builds of the same SHA may produce different SBOMs.
3. **#1816 requires Docker workflow:** Cannot sign/attest an image that isn't being built/published.

## Files Created

- `apps/web/src/lib/lease.ts`
- `apps/web/src/lib/lease.test.ts`
- `contracts/crashlab-core/src/lease.rs`
- `APPROACH_STATEMENT.md` (this file)

## Files Modified

- `apps/web/src/lib/run-status.ts` (added `cancelling` state)
- `contracts/crashlab-core/src/run_control.rs` (added `Cancelling` variant to `RunTerminalState`)
- `contracts/crashlab-core/src/lib.rs` (added `pub mod lease`)
- `contracts/Cargo.toml` (added `uuid` workspace dependency)
- `contracts/crashlab-core/Cargo.toml` (added `uuid` dependency)

## Testing Strategy

### Lease Tests (Completed)

**TypeScript:** `apps/web/src/lib/lease.test.ts`
- Acquire/renew/release lifecycle
- Contention (two holders competing)
- Fencing token validation
- Stale lease holder rejection
- KV unavailability handling

**Rust:** `contracts/crashlab-core/src/lease.rs` (inline tests)
- Same coverage as TypeScript tests
- InMemoryLeaseStore for deterministic testing
- Concurrent acquisition tests
- Per-run and per-job lease isolation

### Cancellation Tests (Pending)

- State transition matrix (all valid/invalid transitions)
- Grace period behavior (seeds completing during grace vs after)
- Zombie-write rejection (stale partition writer)
- Partial result sealing and queryability
- Resume from cancelled state

### Build Integrity Tests (Pending)

- Lockfile drift detection (modify `package.json` without lockfile update → CI fails)
- Double-build comparison (two sequential builds → hashes match)

### Supply Chain Tests (Pending)

- SBOM generation produces valid SPDX-JSON
- Signature verification succeeds (once OIDC permissions enabled)
- Provenance attestation is attached to image

## Security and Invariant Notes

1. **Lease Fencing Token is the Correctness Invariant:** Every state write by a lease holder must carry the token. Without token validation, the lease is a hint, not a lock.

2. **Terminal States are Irrevocable:** Once `Cancelled`, `Failed`, or `Completed`, no further state writes are accepted (except for Resume from `Cancelled` if resumable policy is chosen).

3. **Partial Results Must Be Queryable:** Cancelling a run must not delete or mark-inaccessible the seeds completed before cancellation.

4. **Lockfile Must Not Change in This PR:** Per prompt requirement. Confirmed: no lockfile changes introduced.

5. **SBOM Accuracy Depends on Build Determinism:** Without #1828, two builds of same SHA may produce different SBOMs.

6. **No Private Keys Committed:** Cosign keyless signing uses ephemeral keys bound to OIDC identity. `secrets-scan.yml` enforces this.

## Conflict Avoidance

- Branched from latest `main` at `c7ee68bf8d89822359dceb2e307f20de91e742fd`
- No conflicts expected with existing work
- If W5-B05 fencing or similar lands during implementation, lease implementation is compatible and can be integrated

## Next Steps for Completion

1. **Apply leases to call sites** (Tasks #5-9): Wrap each operation with `withLease()` and thread fencing tokens into state writes.
2. **Complete cancellation implementation** (Tasks #13-17): Implement grace period logic, update API routes, render UI state.
3. **Pin versions and add CI jobs** (Tasks #18-20): Add `engines` field, create build integrity workflow.
4. **Docker workflow and supply chain** (Tasks #22-25): Create Docker build/push workflow, add SBOM/signing/attestation steps.
5. **Local verification** (Task #26): Run all CI checks locally before PR.
6. **PR description** (Task #27): Consolidate design notes, test summaries, and confirmation statements.

## Maintainer Action Required

1. **OIDC Permissions:** Enable `id-token: write` permission for workflows if not already enabled, then flip cosign signing step from `continue-on-error: true` to blocking.
2. **Docker Registry:** Confirm registry (GitHub Container Registry recommended), image naming convention, and push permissions.
3. **Grace Period Value:** Confirm 30-second grace period is acceptable or provide preferred value.
4. **Resumability:** Confirm resumable policy for cancelled runs or specify non-resumable.

## References

- Upstash Redis SET NX EX: https://redis.io/commands/set/
- Cosign Keyless Signing: https://docs.sigstore.dev/signing/quickstart/
- SLSA Provenance: https://slsa.dev/spec/v1.0/
- Syft SBOM: https://github.com/anchore/syft
