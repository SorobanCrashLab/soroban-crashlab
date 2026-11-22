# Getting Started

This guide walks you through setting up Soroban CrashLab for the first time. You will have the web dashboard running with mock data in under five minutes.

---

## Prerequisites

Before you begin you will need the following installed on your machine.

| Requirement | Minimum Version | How to Check |
|---|---|---|
| Node.js | 22 or higher | `node --version` |
| npm | 10 or higher | `npm --version` |
| Git | Latest | `git --version` |
| Rust (optional) | 1.80 or higher | `rustc --version` |

The Rust toolchain is only needed if you want to run the fuzzing engine locally. The web dashboard works without it.

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/SorobanCrashLab/soroban-crashlab.git
cd soroban-crashlab
```

---

## Step 2: Start the Web Dashboard

```bash
cd apps/web
npm ci
npm run dev
```

The first command installs all dependencies. The second starts the development server.

Open your browser to http://localhost:3000. You should see the dashboard home page with sample data already loaded.

---

## Step 3: Explore the Dashboard

The dashboard comes with built in mock data that simulates fuzzing campaign results. Every page works without any backend or external service.

Start with these pages to get a feel for the platform.

| Page | What to Look For |
|---|---|
| Dashboard | Overview of recent runs and quick stats |
| Runs | Full list of campaigns with sorting and filtering |
| Analytics | Charts showing failure clusters, trends, and comparisons |
| Triage | Drag and drop board for organizing failures |
| Logs | Real time log viewer with severity filtering |
| Integrations | List of available external service connections |
| Settings | Theme toggle, maintainer mode, alerting presets |

---

## Step 4: Run the Tests

```bash
npm test
```

This runs the full test suite. All tests should pass on a fresh installation.

```bash
npm run build
```

This compiles the production build with no errors.

---

## Step 5: Run the Rust Fuzzing Engine (Optional)

If you want to build and test the Rust fuzzing engine:

```bash
cd contracts/crashlab-core
cargo test --all-targets
```

To build the example Soroban contract:

```bash
cd contracts/soroban-example
cargo build --release --target wasm32-unknown-unknown
```

---

## What if Something Does Not Work

If the dashboard shows loading states on every page, your dependencies may need to be reinstalled.

```bash
cd apps/web
rm -rf node_modules
npm ci
npm run dev
```

If you see build errors related to packages, run:

```bash
npm install
```

Then try `npm run dev` again.

For more specific issues, check the [FAQ](FAQ.md).

---

## Next Steps

Now that you have the dashboard running, here is what you can do next.

- Read the [User Guide](USER_GUIDE.md) to learn about each page and feature in detail
- Follow the [Deployment Guide](DEPLOYMENT.md) to put the dashboard on Vercel
- Browse the [Integrations Guide](INTEGRATIONS.md) to connect external services
- Check the [Contributing Guide](../CONTRIBUTING.md) if you want to help with development
- Look through [open issues](https://github.com/SorobanCrashLab/soroban-crashlab/issues) for ways to contribute
