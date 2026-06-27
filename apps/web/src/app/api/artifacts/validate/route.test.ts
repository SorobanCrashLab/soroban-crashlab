import { describe, it, expect } from "vitest";
import { validateCaseBundle, CASE_BUNDLE_SCHEMA_VERSION } from "./route";

/**
 * Helper to build a minimal valid CaseBundle.
 */
function makeValidBundle(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    schema: CASE_BUNDLE_SCHEMA_VERSION,
    seed: { id: 42, payload: [1, 2, 3] },
    signature: { category: "auth", digest: 123, signature_hash: 456 },
    ...overrides,
  };
}

describe("validateCaseBundle", () => {

  // Happy path

  it("accepts a fully valid versioned bundle", () => {
    const bundle = makeValidBundle();
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.schemaVersion).toBe(CASE_BUNDLE_SCHEMA_VERSION);
    expect(result.seed).toEqual({ id: 42, payloadLength: 3 });
    expect(result.signature).toEqual({ category: "auth", digest: 123, signatureHash: 456 });
    expect(result.environment).toBeNull();
  });

  it("accepts a valid legacy bundle (no schema field)", () => {
    const bundle = makeValidBundle();
    delete (bundle as Record<string, unknown>).schema;
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.schemaVersion).toBeUndefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Legacy bundle detected"),
      ])
    );
  });

  it("accepts a bundle with an environment fingerprint", () => {
    const bundle = makeValidBundle({
      environment: { os: "linux", arch: "x86_64", family: "unix", version: "1.0.0" },
    });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.environment).toEqual({
      os: "linux",
      arch: "x86_64",
      family: "unix",
      version: "1.0.0",
    });
  });

  it("accepts a bundle with failure_payload", () => {
    const bundle = makeValidBundle({ failure_payload: [0xde, 0xad, 0xbe, 0xef] });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a bundle with rpc_envelope", () => {
    const bundle = makeValidBundle({ rpc_envelope: { method: "simulateTransaction" } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  
  // Schema violations
  
  it("rejects missing seed", () => {
    const bundle = makeValidBundle();
    delete (bundle as Record<string, unknown>).seed;
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("seed"))).toBe(true);
  });

  it("rejects missing signature", () => {
    const bundle = makeValidBundle();
    delete (bundle as Record<string, unknown>).signature;
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("signature"))).toBe(true);
  });

  it("rejects wrong schema version", () => {
    const bundle = makeValidBundle({ schema: 99 });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("schema"))).toBe(true);
  });

  it("rejects negative seed id", () => {
    const bundle = makeValidBundle({ seed: { id: -1, payload: [1] } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("rejects non-integer seed id", () => {
    const bundle = makeValidBundle({ seed: { id: 3.14, payload: [1] } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("rejects payload with values outside byte range", () => {
    const bundle = makeValidBundle({ seed: { id: 1, payload: [256] } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("payload"))).toBe(true);
  });

  it("rejects payload with negative byte values", () => {
    const bundle = makeValidBundle({ seed: { id: 1, payload: [-1] } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("payload"))).toBe(true);
  });

  it("rejects oversized payload", () => {
    const bundle = makeValidBundle({ seed: { id: 1, payload: new Array(65).fill(1) } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("payload"))).toBe(true);
  });

  it("rejects empty signature category", () => {
    const bundle = makeValidBundle({ signature: { category: "", digest: 1, signature_hash: 1 } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("category"))).toBe(true);
  });

  
  // Seed constraint violations
  
  it("rejects payload shorter than 1 byte", () => {
    const bundle = makeValidBundle({ seed: { id: 1, payload: [] } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("too short"))).toBe(true);
  });

  it("rejects payload longer than 64 bytes", () => {
    const bundle = makeValidBundle({ seed: { id: 1, payload: new Array(65).fill(1) } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("too long"))).toBe(true);
  });

  
  // Warnings

  it("warns about null bytes in payload", () => {
    const bundle = makeValidBundle({ seed: { id: 1, payload: [0x00, 0x01] } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("null bytes"))).toBe(true);
  });

  it("warns about unknown signature category", () => {
    const bundle = makeValidBundle({ signature: { category: "unknown", digest: 1, signature_hash: 1 } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("Unknown signature category"))).toBe(true);
  });

  it("warns about missing environment fingerprint", () => {
    const bundle = makeValidBundle();
    delete (bundle as Record<string, unknown>).environment;
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("environment fingerprint"))).toBe(true);
  });


  // Edge cases

  it("handles null input gracefully", () => {
    const result = validateCaseBundle(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles non-object input gracefully", () => {
    const result = validateCaseBundle("not-an-object");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles empty object input gracefully", () => {
    const result = validateCaseBundle({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts exactly 64-byte payload boundary", () => {
    const bundle = makeValidBundle({ seed: { id: 1, payload: new Array(64).fill(1) } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.seed?.payloadLength).toBe(64);
  });

  it("accepts exactly 1-byte payload boundary", () => {
    const bundle = makeValidBundle({ seed: { id: 1, payload: [0xab] } });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.seed?.payloadLength).toBe(1);
  });

  it("accepts legacy runtime-failure category", () => {
    const bundle = makeValidBundle({
      signature: { category: "runtime-failure", digest: 1, signature_hash: 1 },
      environment: { os: "linux", arch: "x86_64", family: "unix", version: "1.0.0" },
    });
    const result = validateCaseBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0); // runtime-failure is a known legacy category
  });

  it("accepts all stable failure categories without warnings", () => {
    const categories = ["auth", "budget", "state", "xdr"];
    for (const category of categories) {
      const bundle = makeValidBundle({
        signature: { category, digest: 1, signature_hash: 1 },
        environment: { os: "linux", arch: "x86_64", family: "unix", version: "1.0.0" },
      });
      const result = validateCaseBundle(bundle);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    }
  });
});