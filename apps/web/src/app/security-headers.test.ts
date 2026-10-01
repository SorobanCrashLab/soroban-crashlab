import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { nextConfig } from "../../next.config";

describe("Security Response Headers", () => {
  it("defines hardened headers in nextConfig matching production hardening requirements", async () => {
    const headersFn = nextConfig.headers;
    expect(typeof headersFn).toBe("function");
    const headerRules = await headersFn!();
    expect(headerRules).toBeDefined();
    expect(headerRules.length).toBeGreaterThan(0);

    const rule = headerRules[0];
    expect(rule.source).toBe("/:path*");
    const headerMap = new Map(rule.headers.map((h) => [h.key, h.value]));

    expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headerMap.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headerMap.has("X-XSS-Protection")).toBe(false);
    expect(headerMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerMap.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(headerMap.get("Permissions-Policy")).toContain("camera=()");
    expect(headerMap.get("Permissions-Policy")).toContain("microphone=()");
    expect(headerMap.get("Permissions-Policy")).toContain("geolocation=()");

    // Content-Security-Policy is intentionally absent from the static headers
    // (issue #1545). A `headers()` value is fixed at build time and therefore
    // cannot carry a per-request nonce, so the policy is attached in
    // src/proxy.ts. Emitting it here as well would produce a second, weaker
    // header that the browser intersects with the real one. The policy itself
    // is asserted in src/lib/csp.test.ts and src/proxy.test.ts.
    expect(headerMap.has("Content-Security-Policy")).toBe(false);
  });

  it("does not ship a static CSP that would weaken the nonce policy", async () => {
    const headersFn = nextConfig.headers;
    const headerRules = await headersFn!();
    const serialized = JSON.stringify(headerRules);

    expect(serialized).not.toContain("'unsafe-eval'");
  });

  it("mirrors security headers in root vercel.json and apps/web/vercel.json", () => {
    // __dirname is apps/web/src/app, so the repo root is four levels up. The
    // previous "../../.." resolved to apps/ and threw ENOENT, which went
    // unnoticed because this file was not wired into any npm run script.
    const rootDir = path.resolve(__dirname, "../../../..");
    const rootVercelPath = path.join(rootDir, "vercel.json");
    const webVercelPath = path.join(rootDir, "apps/web/vercel.json");

    for (const vercelPath of [rootVercelPath, webVercelPath]) {
      const raw = fs.readFileSync(vercelPath, "utf8");
      const config = JSON.parse(raw);
      expect(config.headers).toBeDefined();
      const headersList = config.headers[0].headers;
      const headerMap = new Map(headersList.map((h: { key: string; value: string }) => [h.key, h.value]));

      expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");
      expect(headerMap.get("X-Frame-Options")).toBe("SAMEORIGIN");
      expect(headerMap.has("X-XSS-Protection")).toBe(false);
      expect(headerMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(headerMap.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains; preload");
      expect(headerMap.get("Permissions-Policy")).toContain("camera=()");
      // The CSP moved to the per-request proxy (see src/proxy.ts); a static
      // edge header cannot express a per-request nonce. See src/lib/csp.test.ts.
      expect(headerMap.has("Content-Security-Policy")).toBe(false);
      expect(JSON.stringify(config.headers)).not.toContain("'unsafe-eval'");
    }
  });
});
