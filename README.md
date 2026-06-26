# Soroban CrashLab

**Advanced fuzzing and mutation testing framework for Soroban smart contracts on the Stellar network.**

CrashLab automatically discovers edge cases and vulnerabilities in your Soroban contracts by generating millions of adversarial inputs, detecting crashes, and converting them into reproducible regression tests. Think of it as a crash test dummy for your blockchain code.

[![Build Status](https://github.com/SorobanCrashLab/soroban-crashlab/actions/workflows/ci.yml/badge.svg)](https://github.com/SorobanCrashLab/soroban-crashlab/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban-0A66C2)](https://stellar.org)

---

## Why CrashLab?

Smart contracts on blockchain handle real assets. A single bug can lead to loss of funds or unauthorized token minting. Traditional testing misses edge cases that attackers exploit. CrashLab solves this by:

- **Automated adversarial input generation** — Mutates seeds, boundary cases, enum flips, and decimal extremes
- **Cross auth mode testing** — Catches authorization bugs across all three Soroban auth modes
- **Flaky detection** — Separates reproducible crashes from random noise
- **Deterministic replay** — Same seed always produces the same result
- **CI export** — Converts failures into regression tests automatically
- **Web dashboard** — Visual triage, trends, and campaign management

---

## Quick Start

### Prerequisites

- Node.js 22+ and npm 10+
- Rust stable (1.80+) and Cargo
- Git

### Frontend Dashboard

```bash
cd apps/web
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### Backend Fuzzing Engine

```bash
cd contracts/crashlab-core
cargo test --all-targets
```

### Smart Contract Example

```bash
cd contracts/soroban-example
cargo build --release --target wasm32-unknown-unknown
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   User Browser                       │
│           (Next.js Dashboard - Vercel)               │
├─────────────────────────────────────────────────────┤
│                    API Layer                         │
│         (Next.js API Routes / Backend Proxy)         │
├─────────────────────────────────────────────────────┤
│               Rust Fuzzing Engine                    │
│    (Seed Generation → Mutation → Classification)     │
├─────────────────────────────────────────────────────┤
│            Stellar Soroban Contract                  │
│           (WASM compiled contract target)            │
└─────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Web Dashboard | `apps/web/` | Next.js frontend with run history, analytics, triage, and settings |
| Fuzzing Engine | `contracts/crashlab-core/` | Rust library for seed mutation, crash detection, and replay |
| Example Contract | `contracts/soroban-example/` | Target ERC-20-like contract for fuzzing demonstrations |
| Documentation | `docs/` | Architecture, reproducibility, and release guides |

---

## Features

### Smart Contract Fuzzing
- **Seed generation** with structured random inputs (ID + payload bytes)
- **Deterministic mutation** using XOR-based bit-flipping
- **Nine failure categories** — auth, budget, state, xdr, invalid enum tag, empty input, oversized input, unknown, timeout
- **Auth matrix testing** — Runs every seed under all three Soroban authorization modes
- **Flaky detection** — Separates truly reproducible crashes from non-deterministic failures
- **Checkpoint resume** — Long campaigns can be paused and resumed without data loss
- **Parallel worker support** — Deterministic partitioning across multiple machines

### Web Dashboard
- **Dark terminal or Navy Professional theme** — Choose your preferred visual style
- **Run management** — View, filter, sort, and manage fuzzing campaigns
- **Analytics** — Failure clusters, performance heatmaps, flaky test detection, crash trends
- **Failure triage** — Group failures by signature, review crash details, take action
- **Integrations hub** — Sentry, Prometheus, webhooks, issue trackers, and more
- **Settings** — Alerting presets, reporting templates, accessibility options
- **Maintainer tools** — SLA tracking, conflict of interest policy, system monitoring

### Security Hardening
- **Adversarial input handling** — All fuzz input treated as fully adversarial
- **Seed validation** — Configurable payload length and ID bounds
- **Safe artifact naming** — FNV-1a signature hashes for collision-safe file paths
- **Environment fingerprinting** — Records OS, CPU architecture, and tool version for replay validation
- **Secret redaction** — Sanitizes failure payloads before public sharing

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Guide](docs/ARCHITECTURE.md) | System architecture, data flow, and design decisions |
| [Reproducibility Guide](docs/REPRODUCIBILITY.md) | Deterministic guarantees and troubleshooting |
| [Roadmap](docs/ROADMAP.md) | Milestone overview and issue tracking |
| [Environment Variables](docs/ENVIRONMENT_VARIABLES.md) | Web app, API route, and deployment configuration reference |
| [Release Process](docs/RELEASE_PROCESS.md) | Maintainer checklist for releases |
| [Product Vision](docs/VISION.md) | 90% done criteria and roadmap alignment |
| [Contributing Guide](CONTRIBUTING.md) | How to contribute to CrashLab |
| [Security Policy](.github/SECURITY.md) | Vulnerability reporting and handling |

---

## Smart Contract Deployment

### Deploy to Stellar Testnet

```bash
# Install the soroban CLI
cargo install --locked soroban-cli

# Navigate to the example contract
cd contracts/soroban-example

# Run the deployment script
chmod +x deploy-testnet.sh
./deploy-testnet.sh
```

The script will:
1. Configure the Stellar testnet network
2. Generate a testnet identity with free test XLM
3. Build the contract to WASM
4. Deploy the contract and output the contract ID
5. Save the contract ID to your `.env.local` file

### Deploy to Mainnet

For production deployments, update the network configuration:
```bash
soroban network add --global mainnet \
    --rpc-url https://soroban-rpc.mainnet.stellar.org \
    --network-passphrase "Public Global Stellar Network ; September 2015"
```

You will need real XLM for mainnet deployment fees.

---

## Frontend Deployment

### Deploy to Vercel (Free)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repository
3. Vercel auto-detects Next.js — use the default settings
4. Add environment variables:
   - `NEXT_PUBLIC_ENABLE_MOCK_DATA=true` (until backend is ready)
5. Deploy — your dashboard will be live in about 2 minutes

### Environment Variables

For the complete reference, including server-only API route settings, see
[`docs/ENV.md`](docs/ENV.md).

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL (leave empty for mock data) | empty |
| `NEXT_PUBLIC_ENABLE_MOCK_DATA` | Use mock data when backend is unavailable | `true` |
| `NEXT_PUBLIC_APP_URL` | Application URL for server-side fetches | auto-detected |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Stellar network (testnet/mainnet) | `testnet` |
| `NEXT_PUBLIC_CONTRACT_ID` | Deployed contract ID | empty |

---

## Development

### Run Tests

```bash
# Frontend tests
cd apps/web
npm test

# Rust tests
cd contracts/crashlab-core
cargo test --all-targets

# End-to-end tests
cd apps/web
npx playwright test
```

### Build

```bash
cd apps/web
npm run build
```

### Project Structure

```
soroban-crashlab/
├── apps/
│   └── web/                    # Next.js frontend dashboard
│       ├── src/
│       │   ├── app/            # Pages and API routes
│       │   │   ├── api/        # REST API endpoints
│       │   │   ├── runs/       # Run detail pages
│       │   │   ├── analytics/  # Analytics hub
│       │   │   ├── triage/     # Failure triage
│       │   │   ├── settings/   # System settings
│       │   │   └── ...         # Additional pages
│       │   ├── components/     # Shared UI components
│       │   └── lib/            # Utilities and API client
│       └── deployment-guide.md # Step-by-step deployment guide
├── contracts/
│   ├── crashlab-core/          # Rust fuzzing engine
│   └── soroban-example/        # Example Soroban contract
├── docs/                       # Project documentation
├── scripts/                    # Build and automation scripts
└── ops/                        # Operations and backlog
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Fuzzing Engine** | Rust, Soroban SDK 22.x |
| **Frontend** | Next.js 16, React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4, Source Sans 3, JetBrains Mono |
| **Charts** | Recharts 3 |
| **Testing** | Playwright, Rust test harness |
| **CI/CD** | GitHub Actions |
| **Deployment** | Vercel (frontend), Docker (backend) |
| **Blockchain** | Stellar Soroban |

---

## Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for:

- Local setup checklist
- Development workflow
- Pull request guidelines
- Code review expectations

### Good First Issues

Look for issues labeled `good-first-issue` or `help-wanted` in our [issue tracker](https://github.com/SorobanCrashLab/soroban-crashlab/issues).

---

## Community

- [GitHub Issues](https://github.com/SorobanCrashLab/soroban-crashlab/issues) — Bug reports and feature requests
- [GitHub Discussions](https://github.com/SorobanCrashLab/soroban-crashlab/discussions) — Questions and community support
- [Stellar Ecosystem](https://stellar.org) — Learn more about Stellar and Soroban

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

Built for the Stellar Soroban ecosystem. Smart contracts deserve robust testing.
