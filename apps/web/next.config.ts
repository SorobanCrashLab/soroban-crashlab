import type { NextConfig } from "next";
import path from "path";
import { execSync } from "child_process";
import { withSentryConfig } from "@sentry/nextjs";

export const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons",
      },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60,
  },
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
  experimental: {
    optimizePackageImports: ["recharts", "react-markdown", "remark-gfm"],
  },
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "SAMEORIGIN",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        // Content-Security-Policy is intentionally NOT set here.
        //
        // A nonce must be unique per response, so a static `headers()` value
        // cannot express it: it would either pin one nonce for the life of the
        // deployment (replayable by anything that saw a single response) or
        // ship none at all, which blocks Next's own hydration scripts. The
        // policy is therefore attached per request in src/proxy.ts. Setting it
        // here as well would emit a second, weaker header that the browser
        // intersects with the real one. See docs/CSP.md.
      ],
    },
  ],
};

function getGitSha(): string | undefined {
  if (process.env.SENTRY_RELEASE) {
    return process.env.SENTRY_RELEASE;
  }
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA;
  }
  try {
    return execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

const gitSha = getGitSha();

let configWithPlugins: NextConfig = nextConfig;

if (process.env.ANALYZE === "true") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const withBundleAnalyzer = require("@next/bundle-analyzer")({
      enabled: true,
      openAnalyzer: false,
    });
    configWithPlugins = withBundleAnalyzer(configWithPlugins);
  } catch (err) {
    console.warn("Failed to load @next/bundle-analyzer:", err);
  }
}

export default withSentryConfig(
  configWithPlugins,
  {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    release: gitSha
      ? {
          name: gitSha,
          setCommits: {
            auto: true,
          },
        }
      : undefined,
    sourcemaps: {
      deleteSourcemapsAfterUpload: true,
    },
    widenClientFileUpload: true,
    disableLogger: true,
  },
);
