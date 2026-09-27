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

    const csp = headerMap.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it("mirrors security headers in root vercel.json and apps/web/vercel.json", () => {
    const rootDir = path.resolve(__dirname, "../../..");
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
      expect(headerMap.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    }
  });
});
