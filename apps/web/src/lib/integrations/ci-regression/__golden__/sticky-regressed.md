<!-- crashlab:regression-summary -->
## CrashLab regression summary

:x: **3 new failures (blocking)** · 1 recurring · 1 fixed · 2 unchanged

| Classification | Count | Gate |
|---|---:|---|
| New | 3 | blocking |
| Recurring | 1 | known failure, in baseline |
| Fixed | 1 | previously failing, now green |
| Unchanged | 2 | passing |

### Blocking

| Fixture | Expected | Actual |
|---|---|---|
| `seed-3-invoker` | auth | state |
| `seed-5-invoker` | xdr | error: invalid input\_payload hex: Odd number of digits |
| `seed-8-invoker` | auth | budget (baseline: auth) |

Reproduce locally:

```bash
cd contracts && cargo run --release --bin crashlab -- regression-suite crashlab-core/fixtures/regression_suite.json
```

### Fixed

- `seed-9-invoker` — remove it from `contracts/crashlab-core/regression-baseline.json`

<details>
<summary>Recurring (1)</summary>

| Fixture | Expected | Actual |
|---|---|---|
| `seed-7-invoker` | auth | empty-input |

</details>

<details>
<summary>Unchanged (2)</summary>

- `seed-11-invoker`
- `seed-42-invoker`

</details>

---
<sub>Commit `0123456` · [workflow run](https://github.com/SorobanCrashLab/soroban-crashlab/actions/runs/1000) · [how to read this summary](https://github.com/SorobanCrashLab/soroban-crashlab/blob/main/docs/REGRESSION_SUMMARY.md) · updated in place on every run</sub>
