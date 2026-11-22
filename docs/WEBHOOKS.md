# Webhook Consumer Cookbook

Soroban CrashLab delivers run and crash events to any HTTP endpoint you
register. This document is for **the system receiving those deliveries**: how
to verify a signature, what to expect on failure, and what each payload
contains.

If you are *configuring* CrashLab to send webhooks — secrets, event
subscription, the operator-side verification helper — see
[INTEGRATIONS.md](INTEGRATIONS.md#webhooks). This document assumes your
endpoint is already registered and deliveries are arriving.

Every value quoted here is taken from the shipped source, not from a
speculation:

| Behaviour | Source of truth |
|---|---|
| Signing scheme, tolerance, key id | `apps/web/src/lib/webhook-hmac.ts` |
| Headers, POST body | `apps/web/src/lib/webhook-delivery-worker.ts` |
| Payload shape, event types | `apps/web/src/app/webhook-manager.ts` |
| Subscription validation | `apps/web/src/lib/schemas/integrations/webhooks.ts` |
| Backoff maths | `apps/web/src/lib/retry-backoff.ts` |
| Attempt budget, concurrency | `apps/web/src/lib/webhook-retry-queue.ts` |
| Dead-letter lifecycle | `apps/web/src/lib/webhook-dlq.ts` |

---

## 1. Delivery lifecycle

CrashLab never retries inline in the request that triggered the event. The
first attempt happens immediately; if it fails, the delivery is persisted and
retried later by the **webhook-recovery tick**, which is driven by
`POST /api/schedules/tick`. Nothing sleeps inside a request handler, so a slow
or dead receiver cannot hold a request open or cause a retry storm.

```
first attempt (inline)
  ├─ 2xx ──────────────────────────────► done
  └─ failure ──► persisted retry job
                   ├─ retried on the recovery tick with backoff + jitter
                   ├─ budget of 5 attempts total (first + 4 retries)
                   │    ├─ success ──────────► done
                   │    └─ exhausted ─────────► dead-letter queue
                   └─ at most 2 in-flight attempts per receiver host
```

Consequences for a consumer:

- **Deliveries are at-least-once.** A receiver that succeeds but whose
  response is lost in transit will see the same event again. Deduplicate on
  `eventId`.
- **Events can arrive out of order** across different runs; a `run.progressing`
  may land after a `run.completed` if the earlier attempt had to retry.
- **Per-host concurrency is capped at 2**, so a single slow receiver throttles
  only its own deliveries.

---

## 2. Verifying the signature

### The exact string that is signed

CrashLab signs this string, and nothing else:

```
<t>.<raw request body>
```

where `<t>` is the **Unix timestamp in seconds** and `<raw request body>` is the
**exact bytes of the request body**, byte for byte. Concatenation is with a
single `.` separator, and the digest is lowercase hex.

The signature header carries the timestamp it was computed with, so the
verifier does not have to trust a separate header for the value that was
actually signed:

```
Content-Type: application/json
X-Webhook-Event: crash.detected
X-Webhook-Signature: t=1767225600,v1=<64 lowercase hex characters>
X-Webhook-Timestamp: 1767225600
X-Webhook-Key-Id: key-<first 16 hex chars of sha256(secret)>
```

`X-Webhook-Event` is always present and repeats the `eventType`, so a receiver
can route on the header before parsing the body. The three signing headers
appear only when a signing secret is configured; without one the delivery is an
unsigned POST and the receiver has to decide for itself whether to trust it.

The signature header carries the timestamp it was computed with, so the
verifier does not have to trust a separate header for the value that was
actually signed:

The digest is `HMAC-SHA256(secret, "<t>.<body>")` rendered as 64 lowercase hex
characters. The header format is exactly `t=<digits>,v1=<hex>` — a signature
that does not match that shape is rejected before any comparison happens.

### Rules your receiver must follow

1. **Verify against the raw body.** Read the body as bytes *before* parsing
   JSON. Re-serialising the parsed object is not byte-identical in general
   (key order, number formatting, whitespace) and will fail verification.
2. **Compare in constant time.** Use a constant-time comparison, not `===`.
   A timing side channel on a MAC comparison is a real forgery vector.
3. **Enforce a timestamp tolerance.** CrashLab rejects anything more than 300
   seconds (5 minutes) from its own clock. Your receiver should apply the same
   window, otherwise a captured delivery can be replayed at you indefinitely.
4. **Accept the grace key during rotation.** The signature is computed with one
   active secret, but your receiver should verify against the active secret and
   a grace secret. See [Rotation](#6-key-rotation) below.

### Node.js

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { rawBody } from 'express';

const SIGNATURE_RE = /^t=(\d+),v1=([a-f0-9]{64})$/;
const TOLERANCE_SECONDS = 300;

export function verifyCrashlabWebhook(
  body: Buffer,               // raw bytes, read before any JSON.parse
  signatureHeader: string | undefined,
  secrets: string[],          // active first, grace key second
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const match = SIGNATURE_RE.exec(signatureHeader ?? '');
  if (!match) return false;

  const [, timestamp, provided] = match;
  const signedAt = Number(timestamp);
  if (!Number.isSafeInteger(signedAt)) return false;
  if (Math.abs(nowSeconds - signedAt) > TOLERANCE_SECONDS) return false;

  const expected = createHmac('sha256', secrets[0])
    .update(`${timestamp}.${body.toString('utf8')}`)
    .digest('hex');

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  return a.length === b.length && timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib
import hmac
import re
import time

SIGNATURE_RE = re.compile(r"^t=(\d+),v1=([a-f0-9]{64})$")
TOLERANCE_SECONDS = 300


def verify_crashlab_webhook(body: bytes, signature_header: str, secrets: list[str]) -> bool:
    """`body` must be the raw request bytes, captured before json.loads()."""
    match = SIGNATURE_RE.match(signature_header or "")
    if match is None:
        return False

    timestamp, provided = match.group(1), match.group(2)
    if abs(int(time.time()) - int(timestamp)) > TOLERANCE_SECONDS:
        return False

    for secret in secrets:
        expected = hmac.new(
            secret.encode("utf-8"),
            f"{timestamp}.".encode("utf-8") + body,
            hashlib.sha256,
        ).hexdigest()
        # hmac.compare_digest is constant-time.
        if hmac.compare_digest(provided, expected):
            return True
    return False
```

### Rust

```rust
use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

/// `body` must be the raw request bytes, captured before any JSON parsing.
pub fn verify_crashlab_webhook(
    body: &[u8],
    signature_header: Option<&str>,
    secrets: &[&str],
    now_seconds: i64,
) -> bool {
    let header = match signature_header {
        Some(h) => h,
        None => return false,
    };
    let (timestamp, provided) = match parse_signature(header) {
        Some(parts) => parts,
        None => return false,
    };

    let signed_at: i64 = match timestamp.parse() {
        Ok(v) => v,
        Err(_) => return false,
    };
    if (now_seconds - signed_at).abs() > 300 {
        return false;
    }

    let mut signed = Vec::from(timestamp.as_bytes());
    signed.push(b'.');
    signed.extend_from_slice(body);

    for secret in secrets {
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("hmac accepts any key length");
        mac.update(&signed);
        let expected = mac.finalize().into_bytes();
        let expected_hex: String = expected.iter().map(|b| format!("{b:02x}")).collect();
        if bool::from(expected_hex.as_bytes().ct_eq(provided.as_bytes())) {
            return true;
        }
    }
    false
}
```

> `expected_hex.as_bytes().ct_eq(...)` returns immediately on a length
> mismatch, which leaks length. The hex digest is fixed-length by
> construction, so a mismatch here means a malformed header — reject it before
> comparing. If you need the length check to be constant-time too, compare the
> raw 32-byte digests instead of their hex forms.

---

## 3. Payload schema

Every delivery is a `POST` with `Content-Type: application/json` and a body
that is a `WebhookEvent`:

```ts
interface WebhookEvent {
  eventType: 'run.started' | 'run.progressing' | 'run.completed'
            | 'run.failed' | 'run.cancelled' | 'crash.detected';
  timestamp: string;                          // ISO 8601
  eventId: string;                            // UUID — dedupe on this
  run: FuzzingRun;                            // full run record
  context?: Record<string, unknown>;          // additional context
}
```

### Event types

| `eventType` | Emitted when |
|---|---|
| `run.started` | A run begins executing |
| `run.progressing` | Progress is reported during execution |
| `run.completed` | A run finishes without crashing |
| `run.failed` | A run fails for a non-crash reason |
| `run.cancelled` | A run is cancelled |
| `crash.detected` | The fuzzer finds a crash — **this is the event most integrations subscribe to** |

Subscription is validated against this exact set; any other value is rejected
at registration time, so a receiver never has to handle an unknown
`eventType`.

### Example delivery

```json
{
  "eventType": "crash.detected",
  "timestamp": "2026-09-28T09:15:00.000Z",
  "eventId": "0f3c9a52-1d84-4f6e-9b0a-2c5e7d1a8b33",
  "run": {
    "id": "run-2026-09-28-0915",
    "status": "failed",
    "area": "auth",
    "severity": "critical",
    "duration": 3200,
    "seedCount": 12000,
    "cpuInstructions": 1200000,
    "memoryBytes": 8000000,
    "minResourceFee": 3500,
    "crashDetail": {
      "failureCategory": "InvariantViolation",
      "signature": "sig:token:transfer:assert_balance_nonnegative",
      "signatureHash": 918273645,
      "payload": "balance check failed: expected 100, got 99",
      "replayAction": "replay --seed 0xdef"
    },
    "tags": ["critical", "production"],
    "annotations": [],
    "associatedIssues": [
      { "label": "BUG-42", "href": "https://example.com/BUG-42" }
    ]
  },
  "context": { "campaignId": "camp-7" }
}
```

### Deduplicating

`eventId` is a UUID generated per event delivery attempt-set and is stable
across retries of the same event. Store it and reject repeats:

```ts
if (await seenEvents.has(event.eventId)) return ack();
await seenEvents.add(event.eventId);
```

---

## 4. Retries, backoff and dead-lettering

### Attempt budget

| Constant | Value | Meaning |
|---|---|---|
| `WEBHOOK_RETRY_MAX_ATTEMPTS` | 5 | Total attempts, **including** the first inline one — so 4 retries |
| `WEBHOOK_RETRY_PER_TARGET_CONCURRENCY` | 2 | In-flight attempts per receiver host |
| `WEBHOOK_RETRY_MAX_JOBS_PER_TICK` | 20 | Jobs attempted per recovery tick |
| `DLQ_RETENTION_DAYS` | 30 | How long dead-lettered entries are kept |
| `DLQ_PARK_AFTER_ROUNDS` | 3 | Failed automatic drain rounds before an entry is parked for a human |
| `DLQ_DRAIN_PER_TARGET` | 2 | Entries replayed per receiver host per drain |
| `DLQ_REPLAY_CONCURRENCY` | 5 | Replays run in sequential batches of this size |

### Backoff

Delays use **equal jitter**: for attempt *N* the cap is
`min(maxMs, baseMs × 2^(N-1))`, and the actual delay is drawn uniformly from
`[cap/2, cap]`.

The lower half of the window is what stops a burst of failures from collapsing
into immediate retries; the random upper half is what stops every failed
delivery to the same receiver from coming back at the same instant.

In practice, with the default policy, a delivery that exhausts its budget spans
roughly a minute or two — **not** hours. Do not design a receiver that needs
minutes to become available; the budget will be spent.

### What counts as a failure

A delivery is dead-lettered when either:

- the attempt budget is exhausted (`retries-exhausted`), or
- the failure is classified non-retryable (`non-retryable`).

Return a **2xx** to acknowledge. Any non-2xx, a connection failure, or a
timeout counts as a failed attempt.

### After the budget is spent

The entry moves to the **dead-letter queue** with its full error timeline
(each attempt's status code, error and timestamp), and is retained for 30 days.
The queue drains automatically in small, rate-limited batches; entries that
keep failing are **parked** after 3 rounds and then need a human via the retry
dashboard. Parked entries are never drained automatically again.

Practically: a delivery that ends up in the DLQ will **not** arrive at your
endpoint unless someone replays it. If your receiver had a multi-hour outage,
poll the retry dashboard or the recovery API — do not assume the events
reappear on their own.

---

## 5. Running a local receiver

Paste this into a scratch file and run it to debug signature handling against
the real signing code path. It prints the headers, the raw body, and the
expected signature so you can compare byte for byte.

```ts
// receiver.ts — run with: npx tsx receiver.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const SECRET = process.env.WEBHOOK_SECRET ?? 'dev-secret';
const PORT = 4123;

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const signature = req.headers['x-webhook-signature'] as string | undefined;
    const timestamp = req.headers['x-webhook-timestamp'] as string | undefined;

    console.log('--- delivery ---');
    console.log('method          :', req.method);
    console.log('content-type    :', req.headers['content-type']);
    console.log('key id          :', req.headers['x-webhook-key-id']);
    console.log('signature       :', signature);
    console.log('raw body (utf8) :', JSON.stringify(body.toString('utf8')));

    if (signature && timestamp) {
      const expected = createHmac('sha256', SECRET)
        .update(`${timestamp}.${body.toString('utf8')}`)
        .digest('hex');
      const provided = signature.replace(/^t=\d+,v1=/, '');
      const ok =
        provided.length === expected.length &&
        timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
      console.log('expected digest :', expected);
      console.log('verifies        :', ok);
    } else {
      console.log('verifies        : false (unsigned delivery)');
    }

    // Acknowledge, or return 500 to watch the retry/DLQ path locally.
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
}).listen(PORT, () => {
  console.log(`listening on http://localhost:${PORT}`);
  console.log('point a CrashLab webhook URL at the address above');
});
```

To exercise the retry and dead-letter paths, change the final line to
`res.writeHead(500)` and watch attempts arrive with growing delays.

---

## 6. Key rotation

CrashLab reads secrets from `CRASHLAB_WEBHOOK_SIGNING_SECRETS`, a
comma-separated **ordered** list: the active key first, the grace key second.
`CRASHLAB_WEBHOOK_SIGNING_SECRET` (singular) is still accepted for one release.

To rotate without dropping deliveries:

1. Set the **new** secret as the first item, and keep the old one as the second
   item. CrashLab now signs with the new key.
2. Teach your receiver to verify against **both** keys — try the active key
   first, then the grace key. Accept either. This is the window in which a
   delivery signed with the old key still verifies.
3. Once every receiver has switched and the grace window has passed, drop the
   old key from both sides.

```ts
// Accept either key during the grace window.
const accepted = [process.env.ACTIVE_WEBHOOK_SECRET!, process.env.GRACE_WEBHOOK_SECRET!];
```

`X-Webhook-Key-Id` is `key-` followed by the first 16 hex characters of
`sha256(secret)`. It is a **stable, non-secret** identifier, safe to log: it
tells you which key signed a delivery without revealing the key. It is
informational only — never accept a delivery on the strength of the key id
alone.

---

## 7. Checklist

- [ ] Read the raw body before parsing; signature verification uses those exact bytes
- [ ] Compare the MAC in constant time
- [ ] Reject timestamps outside a 5-minute window
- [ ] Acknowledge with 2xx, including for events you do not care about
- [ ] Deduplicate on `eventId` — delivery is at-least-once
- [ ] Verify against both keys during a rotation window
- [ ] Assume out-of-order arrival across runs
- [ ] Monitor the retry dashboard: a DLQ entry will not retry on its own
- [ ] Return 2xx quickly; per-host concurrency is capped at 2 in-flight attempts
