# CaseBundle Upload Validation API

Validates uploaded `CaseBundle` JSON documents against the canonical schema
defined in `crashlab-core`. Performs **structural validation** (Zod schema) and
**semantic validation** (seed constraints, signature categories, environment
fingerprints).

## Endpoint

```
POST /api/artifacts/validate
```

### Request Body

```json
{
  "bundle": {
    "schema": 2,
    "seed": {
      "id": 42,
      "payload": [1, 2, 3]
    },
    "signature": {
      "category": "auth",
      "digest": 123,
      "signature_hash": 456
    },
    "environment": {
      "os": "linux",
      "arch": "x86_64",
      "family": "unix",
      "version": "1.0.0"
    },
    "failure_payload": [222, 173, 190, 239]
  }
}
```

| Field                             | Required                    | Description                                                                |
| --------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `bundle.schema`                   | Yes (versioned bundles)     | Must equal `2` (current `CASE_BUNDLE_SCHEMA_VERSION`)                      |
| `bundle.seed.id`                  | Yes                         | Non-negative integer                                                       |
| `bundle.seed.payload`             | Yes                         | Byte array (`0–255`), length `1–64`                                        |
| `bundle.signature.category`       | Yes                         | Failure class: `auth`, `budget`, `state`, `xdr`, or legacy `runtime-failure` |
| `bundle.signature.digest`         | Yes                         | 64-bit FNV-1a hash                                                         |
| `bundle.signature.signature_hash` | Yes                         | Deterministic artifact hash                                                |
| `bundle.environment`              | No                          | OS/arch/family/version fingerprint for replay checks                       |
| `bundle.failure_payload`          | No                          | Optional diagnostic bytes                                                  |
| `bundle.rpc_envelope`             | No                          | Optional RPC capture for replay auditing                                   |

### Response

`200 OK` — Valid bundle:

```json
{
  "valid": true,
  "schemaVersion": 2,
  "errors": [],
  "warnings": [],
  "seed": { "id": 42, "payloadLength": 3 },
  "signature": { "category": "auth", "digest": 123, "signatureHash": 456 },
  "environment": { "os": "linux", "arch": "x86_64", "family": "unix", "version": "1.0.0" }
}
```

`422 Unprocessable Entity` — Schema or constraint violations:

```json
{
  "valid": false,
  "errors": ["Schema violation at schema: Invalid literal value, expected 2"],
  "warnings": []
}
```

- `400 Bad Request` — body is not valid JSON or is missing the `bundle` field.
- `413 Payload Too Large` — body exceeds 1 MiB.

## Validation Rules

### Structural (Zod Schema)

- `schema` must be exactly `2` for versioned bundles.
- `seed.id` must be a non-negative integer.
- `seed.payload` must be an array of bytes (`0–255`), length `1–64`.
- `signature` fields must be present and non-empty.
- Legacy bundles (no `schema` field) are accepted with a warning.

### Semantic (Seed Constraints)

- Payload length must be between 1 and 64 bytes (mirrors `SeedSchema` in `crashlab-core`).
- Seed ID must not exceed `Number.MAX_SAFE_INTEGER`.

### Warnings (Non-blocking)

- Null bytes in payload: contracts interpreting payloads as C-strings may truncate at `0x00`.
- Unknown signature category: detects typos or new unregistered categories.
- Missing environment fingerprint: replay environment checks are skipped.
- Legacy bundle: missing `schema` field; recommend re-exporting with current `crashlab-core`.

## Security Considerations

- **Size limit:** request bodies are capped at 1 MiB to prevent memory exhaustion.
- **No path traversal:** the API does not write to disk; it only validates in-memory.
- **Adversarial input:** all fields are treated as untrusted; Zod schema validation
  prevents injection of non-numeric types or oversized arrays.

## Testing

The route is covered by the standard `ci.yml` suite (unit and integration tests,
lint, and typecheck). Run locally with:

```bash
cd apps/web
npx vitest run src/app/api/artifacts/validate/route.test.ts
npx vitest run src/app/api/artifacts/validate/route.integration.test.ts
```

No dedicated workflow exists for this path — `ci.yml` already runs these tests
on every push and pull request.