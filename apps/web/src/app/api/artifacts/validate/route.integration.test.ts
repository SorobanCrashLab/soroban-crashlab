import { describe, it, expect } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

describe("POST /api/artifacts/validate", () => {
  /**
   * Helper to build a NextRequest with a JSON body.
   */
  function makeRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest("http://localhost/api/artifacts/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 200 for a valid bundle", async () => {
    const request = makeRequest({
      bundle: {
        schema: 2,
        seed: { id: 1, payload: [1, 2, 3] },
        signature: { category: "auth", digest: 123, signature_hash: 456 },
      },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.valid).toBe(true);
    expect(json.errors).toHaveLength(0);
  });

  it("returns 400 for invalid JSON", async () => {
    const request = new NextRequest("http://localhost/api/artifacts/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.valid).toBe(false);
    expect(json.errors[0]).toContain("Invalid JSON");
  });

  it("returns 400 for missing bundle field", async () => {
    const request = makeRequest({ notBundle: {} });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.valid).toBe(false);
    expect(json.errors[0]).toContain('Missing "bundle"');
  });

  it("returns 422 for schema-invalid bundle", async () => {
    const request = makeRequest({
      bundle: {
        schema: 99, // wrong version
        seed: { id: 1, payload: [1] },
        signature: { category: "auth", digest: 1, signature_hash: 1 },
      },
    });
    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.valid).toBe(false);
    expect(json.errors.length).toBeGreaterThan(0);
  });

  it("returns 413 for oversized body", async () => {
    const request = new NextRequest("http://localhost/api/artifacts/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "2097152", // 2 MiB
      },
      body: JSON.stringify({ bundle: {} }),
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
    const json = await response.json();
    expect(json.valid).toBe(false);
    expect(json.errors[0]).toContain("1 MiB");
  });

  it("returns 422 for payload with constraint violations", async () => {
    const request = makeRequest({
      bundle: {
        schema: 2,
        seed: { id: 1, payload: [] }, // empty payload — too short
        signature: { category: "auth", digest: 1, signature_hash: 1 },
      },
    });
    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.valid).toBe(false);
    expect(json.errors.some((e: string) => e.includes("too short"))).toBe(true);
  });
});