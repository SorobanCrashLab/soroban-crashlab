import { describe, expect, it } from "vitest";
import { nextConfig } from "../../next.config";

describe("Next Image remote patterns", () => {
  it("allows only the exact HTTPS favicon endpoint used by the app", () => {
    expect(nextConfig.images?.remotePatterns).toEqual([
      {
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons",
      },
    ]);
  });
});
