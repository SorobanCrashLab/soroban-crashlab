import type { NextConfig } from "next";
import path from "path";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { withSentryConfig } from "@sentry/nextjs";
import {
  buildSentryBuildOptions,
  resolveSentryRelease,
} from "./src/lib/integrations/sentry-options";

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
const packageVersion = (
  JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf8")) as { version: string }
).version;

// One release name for the build plugin and every runtime (#1889):
// SENTRY_RELEASE, else soroban-crashlab-web@<version>+<git sha>.
const sentryRelease = resolveSentryRelease({
  explicit: process.env.SENTRY_RELEASE,
  version: packageVersion,
  gitSha,
});

// Source-map upload is behind SENTRY_UPLOAD_SOURCEMAPS=true until keys are
// provisioned; with the flag off the plugin needs no credentials and uploads
// nothing. A requested-but-misconfigured upload fails the build loudly.
const sentryBuild = buildSentryBuildOptions(
  {
    SENTRY_UPLOAD_SOURCEMAPS: process.env.SENTRY_UPLOAD_SOURCEMAPS,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    SENTRY_TUNNEL_ROUTE: process.env.SENTRY_TUNNEL_ROUTE,
    CI: process.env.CI,
  },
  sentryRelease,
);
if (sentryBuild.errors.length > 0) {
  throw new Error(`Sentry build configuration: ${sentryBuild.errors.join(" ")}`);
}

if (sentryRelease) {
  nextConfig.env = { ...nextConfig.env, NEXT_PUBLIC_SENTRY_RELEASE: sentryRelease };
}

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

export default withSentryConfig(configWithPlugins, {
  ...sentryBuild.options,
  disableLogger: true,
});
