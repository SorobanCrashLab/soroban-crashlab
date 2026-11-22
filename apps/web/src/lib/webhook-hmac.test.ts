import { describe, expect, it, vi } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "./webhook-hmac";

describe("webhook HMAC signatures", () => {
  it("rejects signatures outside the five-minute replay window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 301);
    const signature = await signWebhookPayload(
      '{"event":"crash"}',
      "active-secret",
      oldTimestamp,
    );

    await expect(
      verifyWebhookSignature('{"event":"crash"}', signature, "active-secret"),
    ).resolves.toBe(false);
    vi.useRealTimers();
  });

  it("accepts the grace key during rotation", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await signWebhookPayload(
      '{"event":"crash"}',
      "grace-secret",
      timestamp,
    );

    await expect(
      verifyWebhookSignature('{"event":"crash"}', signature, [
        "active-secret",
        "grace-secret",
      ]),
    ).resolves.toBe(true);
  });

  it("rejects tampered bodies and a mismatched timestamp header", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = '{"event":"crash"}';
    const signature = await signWebhookPayload(
      body,
      "active-secret",
      timestamp,
    );

    await expect(
      verifyWebhookSignature('{"event":"other"}', signature, "active-secret"),
    ).resolves.toBe(false);
    await expect(
      verifyWebhookSignature(
        body,
        signature,
        "active-secret",
        300,
        String(Number(timestamp) - 1),
      ),
    ).resolves.toBe(false);
  });
});
