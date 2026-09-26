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
    viewTransition: true,
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
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            // Next.js emits small inline bootstrapping scripts for hydration.
            "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            // Fonts are self-hosted via next/font — no Google origins needed.
            "font-src 'self' data:",
            "connect-src 'self' https:",
            "frame-ancestors 'self'",
            "form-action 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "upgrade-insecure-requests",
          ].join("; "),
        },
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
    setCommits: {
      auto: true,
    },
    sourcemaps: {
      deleteSourcemapsAfterUpload: true,
    },
  },
  {
    widenClientFileUpload: true,
    hideSourceMaps: true,
    disableLogger: true,
    sourcemaps: {
      deleteSourcemapsAfterUpload: true,
    },
  },
);
