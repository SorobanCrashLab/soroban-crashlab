import * as assert from "node:assert/strict";
import {
  generateShareableToken,
  verifyShareableToken,
  decodeShareableTokenInfo,
  DEFAULT_SHAREABLE_TTL_MS,
  DEFAULT_CLOCK_SKEW_MS,
} from "./shareable-report-utils";

const SECRET = "test-secret-for-unit-tests";

const runAssertions = () => {
  // Happy path: valid token verifies to the run id.
  const now = 1_700_000_000_000;
  const token = generateShareableToken("run-abc", DEFAULT_SHAREABLE_TTL_MS, now, SECRET);
  assert.equal(verifyShareableToken(token, { now: now + 1000, clockSkewMs: DEFAULT_CLOCK_SKEW_MS, secret: SECRET }), "run-abc");

  // Token metadata decode.
  const info = decodeShareableTokenInfo(token);
  assert.ok(info);
  assert.equal(info!.runId, "run-abc");
  assert.equal(info!.issuedAt, now);
  assert.equal(info!.expiresAt, now + DEFAULT_SHAREABLE_TTL_MS);

  // Expiry boundary: exactly at expiry is valid.
  assert.equal(verifyShareableToken(token, { now: now + DEFAULT_SHAREABLE_TTL_MS, secret: SECRET }), "run-abc");
  // Past expiry rejected (and NOT extended by clock skew).
  assert.equal(
    verifyShareableToken(token, { now: now + DEFAULT_SHAREABLE_TTL_MS + 1, clockSkewMs: 60 * 60 * 1000, secret: SECRET }),
    null,
  );

  // Clock skew applies to issued-at freshness only: a token from slightly in
  // the future (within allowance) is accepted...
  const skewToken = generateShareableToken("run-skew", DEFAULT_SHAREABLE_TTL_MS, now, SECRET);
  assert.equal(
    verifyShareableToken(skewToken, { now: now + 1000, clockSkewMs: DEFAULT_CLOCK_SKEW_MS, secret: SECRET }),
    "run-skew",
  );
  // ...but beyond the skew allowance it is rejected as not-yet-issued.
  assert.equal(
    verifyShareableToken(skewToken, { now: now - DEFAULT_CLOCK_SKEW_MS - 1, clockSkewMs: DEFAULT_CLOCK_SKEW_MS, secret: SECRET }),
    null,
  );

  // Tamper vectors: edited expiry, edited id, and edited signature each rejected.
  const payloadBase = Buffer.from(token, "base64url").toString("utf8");
  const parsed = JSON.parse(payloadBase) as { runId: string; iat: number; exp: number; sig: string };

  const tamperedExpiry = { ...parsed, exp: parsed.exp + 999_999_999 };
  const expToken = Buffer.from(JSON.stringify(tamperedExpiry)).toString("base64url");
  assert.equal(verifyShareableToken(expToken, { now, secret: SECRET }), null, "edited expiry must be rejected");

  const tamperedId = { ...parsed, runId: "run-forged" };
  const idToken = Buffer.from(JSON.stringify(tamperedId)).toString("base64url");
  assert.equal(verifyShareableToken(idToken, { now, secret: SECRET }), null, "edited id must be rejected");

  const tamperedSig = { ...parsed, sig: "0".repeat(parsed.sig.length) };
  const sigToken = Buffer.from(JSON.stringify(tamperedSig)).toString("base64url");
  assert.equal(verifyShareableToken(sigToken, { now, secret: SECRET }), null, "edited signature must be rejected");

  // Wrong secret rejects.
  assert.equal(verifyShareableToken(token, { now, secret: "other-secret" }), null, "wrong secret must be rejected");

  // Unsigned / legacy / malformed tokens return null (graceful path).
  assert.equal(verifyShareableToken("not-a-valid-base64url-token", { now, secret: SECRET }), null);
  assert.equal(verifyShareableToken("", { now, secret: SECRET }), null);
  const legacy = Buffer.from(JSON.stringify({ runId: "legacy", exp: now + 1000 })).toString("base64url");
  assert.equal(verifyShareableToken(legacy, { now, secret: SECRET }), null, "unsigned legacy link must be rejected");

  // Signature mismatch between two different run ids cannot be reused.
  const otherToken = generateShareableToken("run-xyz", DEFAULT_SHAREABLE_TTL_MS, now, SECRET);
  const swapped = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(otherToken, "base64url").toString()), runId: "run-abc" }),
  ).toString("base64url");
  assert.equal(verifyShareableToken(swapped, { now, secret: SECRET }), null, "cross-id replay must be rejected");
};

runAssertions();
console.log("shareable-report-utils (lib) test: all assertions passed");
