# Soroban CrashLab Documentation

Welcome to the Soroban CrashLab documentation. This is the central reference for understanding, deploying, and contributing to the platform.

Soroban CrashLab is an open source dashboard for monitoring and analyzing smart contract fuzzing campaigns on the Stellar network. It helps developers discover edge cases, reproduce crashes, and track campaign health through a visual interface.

---

## Quick Navigation

| If you want to | Start here |
|---|---|
| Get up and running quickly | [Getting Started](GETTING_STARTED.md) |
| Understand how the platform works | [Architecture Overview](ARCHITECTURE.md) |
| Read core design decisions | [Architecture Decision Records (ADRs)](adr/README.md) |
| Learn the dashboard features | [User Guide](USER_GUIDE.md) |
| Connect external services | [Integrations Guide](INTEGRATIONS.md) |
| Deploy to production | [Deployment Guide](DEPLOYMENT.md) |
| Browse all API endpoints | [API Reference](API.md) |
| Set environment variables | [Environment Configuration](ENV.md) |
| Contribute to the project | [Contributing Guide](../CONTRIBUTING.md) |
| See what is planned | [Roadmap](ROADMAP.md) and [Vision](VISION.md) |
| Troubleshoot issues | [FAQ](FAQ.md) |

---

## What Soroban CrashLab Does

Smart contracts handle real assets on the Stellar network. A single edge case can lead to loss of funds or broken functionality. Traditional unit tests are written by the same developer who wrote the contract and tend to miss the same assumptions.

Soroban CrashLab solves this by treating every input as adversarial. It generates millions of mutated inputs, runs them against your contract, detects crashes, classifies them by failure type, and converts reproducible failures into regression tests you can add to your CI pipeline.

The web dashboard gives you real time visibility into everything. You can browse run history, compare campaigns side by side, triage failures on a drag and drop board, track performance trends over time, and configure alerts that notify you when crash rates spike.

---

## Technology Stack

The project has two main layers.

**The Rust fuzzing engine** lives in `contracts/crashlab-core/`. It handles seed generation, mutation, crash classification, auth mode testing, flaky detection, and deterministic replay. It runs as a standalone binary or can be integrated into CI pipelines.

**The web dashboard** is a Next.js application in `apps/web/`. It provides 37 pages covering campaign management, analytics, failure triage, trends, logs, integrations, and settings. The dashboard works with mock data out of the box so you can explore it without setting up a backend.

| Component | Technology |
|---|---|
| Fuzzing engine | Rust, Soroban SDK 22.x |
| Web dashboard | Next.js 16, React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, Source Sans 3, JetBrains Mono |
| Charts | Recharts 3 |
| Testing | Playwright, Rust test harness |
| CI/CD | GitHub Actions |
| Deployment | Vercel for frontend, Docker for backend |
| Blockchain | Stellar Soroban |

---

## Project Structure

```
soroban-crashlab/
├── apps/
│   └── web/                    # Next.js web dashboard
│       └── src/
│           ├── app/            # Pages, API routes, utilities
│           │   ├── api/        # REST API endpoints
│           │   ├── runs/       # Run history and detail pages
│           │   ├── analytics/  # Analytics hub with charts
│           │   ├── triage/     # Failure triage board
│           │   ├── trends/     # Performance trends
│           │   ├── logs/       # Log viewer
│           │   ├── integrations/ # Integration pages
│           │   └── settings/   # System settings
│           ├── components/     # Shared UI components
│           └── lib/            # API client and utilities
├── contracts/
│   ├── crashlab-core/          # Rust fuzzing engine
│   └── soroban-example/        # Example Soroban contract
├── docs/                       # Project documentation
├── scripts/                    # Automation scripts
└── .github/                    # CI workflows and templates
```

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/SorobanCrashLab/soroban-crashlab.git
cd soroban-crashlab

# Start the web dashboard
cd apps/web
npm ci
npm run dev
```

Open http://localhost:3000 to see the dashboard. It comes with built in mock data so every page works immediately without any backend setup.

For the full guide, see [Getting Started](GETTING_STARTED.md).

---

## Where to Go Next

- **New users** start with the [Getting Started Guide](GETTING_STARTED.md)
- **Developers** read the [Architecture Overview](ARCHITECTURE.md)
- **Contributors** check the [Contributing Guide](../CONTRIBUTING.md) and browse [open issues](https://github.com/SorobanCrashLab/soroban-crashlab/issues)
- **Everyone** can explore the [User Guide](USER_GUIDE.md) to learn what the dashboard can do
