# Frequently Asked Questions

## General

### What is Soroban CrashLab?

It is an open source dashboard for monitoring and analyzing smart contract fuzzing campaigns on the Stellar network. It combines a Rust based fuzzing engine with a web dashboard to help developers discover edge cases, reproduce crashes, and track campaign health.

### Who is it for?

Smart contract developers building on Soroban, security auditors reviewing Stellar projects, and teams running continuous fuzzing pipelines across multiple contracts.

### Does it work without a backend?

Yes. The dashboard ships with built in mock data that simulates real campaign results. Every page works immediately after you start the development server. You only need a backend when you are ready to run real fuzzing campaigns.

### Is it free?

The software is open source under the MIT license. The web dashboard can be deployed on Vercel's free tier. The Rust fuzzing engine runs on your own hardware. There is no paid tier or SaaS version.

---

## Setup and Installation

### The dashboard shows loading states on every page

Your dependencies may need to be reinstalled. Run these commands from the `apps/web` directory.

```bash
rm -rf node_modules
npm ci
npm run dev
```

### I see a build error about missing packages

Run `npm install` from the `apps/web` directory and try again. If the error persists, check that you are using Node.js version 22 or higher.

### Do I need Rust to use the dashboard?

No. The web dashboard works independently of the Rust fuzzing engine. You only need Rust if you want to build and run the fuzzing engine locally.

### How do I switch from mock data to a real backend?

Set the `NEXT_PUBLIC_API_URL` environment variable to point to your running backend instance. When this variable is set, the dashboard proxies API requests to that URL instead of generating mock data.

---

## Features

### Can I customize the dashboard layout?

Yes. Enable maintainer mode in Settings and you will see a layout editor that lets you reorder sections and toggle their visibility.

### How do I change the theme?

Use the sun and moon icon in the navigation bar to switch between light and dark mode. You can also change it in Settings.

### What integrations are available?

The platform connects with Sentry, PagerDuty, Slack, Prometheus, Discord, GitHub Issues, Jira, Linear, Datadog, and custom webhooks. Each integration has its own configuration page in the Integrations section.

### Can I export my data?

Yes. You can export campaign data from the runs page. The export includes run metadata, crash details, and resource metrics.

---

## Development

### Why did my reproduction fail?

Follow the decision tree in the [reproducibility contract](reproducibility-contract.md#7-why-did-my-repro-fail). It separates the cases the contract covers (report them as bugs) from known nondeterminism such as timeouts and RPC-mode runs.

### How do I run the tests?

From the `apps/web` directory, run `npm test`. This runs all test suites. For individual test suites, use the specific test scripts listed in `package.json`.

### How do I run end to end tests?

```bash
cd apps/web
npx playwright test
```

### How do I build the Rust fuzzing engine?

```bash
cd contracts/crashlab-core
cargo build --release
```

### How do I contribute?

Check the Contributing Guide for the full workflow. In short, find an open issue you want to work on, create a branch, implement the changes, run checks locally, and submit a pull request with `Closes #issueNumber` in the description.

---

## Troubleshooting

### The build fails with TypeScript errors

Run `npm run build` from the `apps/web` directory and check the error messages. Common issues include missing type definitions or incorrect import paths.

### The CI pipeline is failing

Check the GitHub Actions logs for the specific job that failed. The most common causes are lint errors, test failures, or build errors. Run the same checks locally to reproduce the issue.

### I found a bug

Open a GitHub issue with a clear description of the problem, steps to reproduce, and what you expected to happen. Include your browser version and any relevant error messages from the browser console.

### I have a feature request

Open a GitHub issue with the feature tag. Describe what you want to achieve and why it would be useful. If possible, include examples of how you would use the feature.

---

## Account and Security

### Does the dashboard require authentication?

The current version does not include authentication middleware. The GitHub OAuth callback endpoint exists but is not fully integrated with route protection. This is a known area for improvement.

### How are secrets handled?

API keys and webhook secrets are stored in environment variables or local storage. The application uses a gitleaks configuration to scan for accidentally committed secrets in CI.

### Is there a security policy?

Yes. See the SECURITY.md file in the repository for vulnerability reporting and handling procedures.
