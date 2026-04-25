This is a [Next.js](https://nextjs.org) dashboard for Soroban CrashLab.

## Dashboard Notes

- The home page includes a failure cluster view that groups failed runs by signature and context, then links each group to a representative sample run for triage.
- Metrics export to Prometheus integration boundary checks are defined in `src/app/integrate-metrics-export-to-prometheus-utils.ts`.
- Run->issue link integration tests use deterministic boundary contracts in `src/app/integrate-run-issue-link-integration-tests-utils.ts`.

## Run->Issue Link Integration Contract

The integration flow expects four externally provided boundaries:

- `getRunById(runId)`: return run + existing issue links, or `null` if missing.
- `getEnabledTrackerById(trackerId)`: return enabled tracker config, or `null` if unavailable.
- `createRunIssueLink(...)`: persist and return created issue link payload.
- `verifyIssueLink(link)`: return `{ reachable, statusCode }` from downstream issue system.

Failure behavior is explicit and step-based:

- Unknown run -> fail at `run-lookup`
- Missing/disabled/invalid tracker -> fail at `tracker-lookup` / `tracker-validation`
- Duplicate run->issue link -> fail at `dedupe-check`
- Downstream issue endpoint failure (`reachable=false` or `statusCode>=400`) -> fail at `link-verify`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Metrics Export Integration Contract

Prometheus export integration checks rely on these external boundary contracts:

- `resolveConfig()`: returns export config or `null` if unavailable.
- `pushMetrics(config)`: pushes metrics and returns `{ accepted, pushedSeries }`.
- `queryExporterHealth(endpoint)`: verifies downstream exporter health with `{ healthy, statusCode }`.

Failure behavior is deterministic and step-based:

- Missing config -> `config-resolve` failed
- Invalid config -> `config-validate` failed
- Rejected push / zero series -> `metrics-push` failed
- Unhealthy downstream endpoint (`healthy=false` or `statusCode >= 400`) -> `health-query` failed
