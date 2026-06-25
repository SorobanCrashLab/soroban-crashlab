# Soroban CrashLab Deployment Guide

This guide walks you through deploying the entire platform step by step.
Read through each section carefully before starting.

---

## Part 1: Frontend on Vercel (Free Tier)

### What you need

- A GitHub account
- A Vercel account (sign up at vercel.com with your GitHub)
- Your code pushed to a GitHub repository

### Step 1: Push your code to GitHub

If you have not done this yet:

```bash
git add .
git commit -m "feat: full platform revamp with dark terminal UI and API service layer"
git push origin main
```

### Step 2: Import to Vercel

1. Go to vercel.com and click Add New then Project
2. Import your GitHub repository
3. Vercel will auto detect Next.js. The default settings should work.
4. In the Configure step, set these environment variables:

| Variable | Value |
|----------|-------|
| NEXT_PUBLIC_APP_URL | https://your-project.vercel.app (or leave blank for auto detect) |
| NEXT_PUBLIC_ENABLE_MOCK_DATA | true (until you connect a real backend) |

5. Click Deploy

Your frontend will be live in about 2 minutes.

### Step 3: Connect a custom domain (optional)

1. In your Vercel project dashboard, go to Settings then Domains
2. Add your domain and follow Vercel's DNS instructions

---

## Part 2: Backend with Docker

The Rust fuzzing engine can run as a Docker container. For free hosting, you can use services like Back4app, Render, or Railway.

### Building the Docker image

```bash
# From the project root
docker build -t crashlab-backend -f Dockerfile .
```

### Running locally

```bash
docker run -p 8080:8080 crashlab-backend
```

### Deploying to Back4app (free tier)

1. Create an account at back4app.com
2. Create a new Docker container app
3. Upload your Docker image or connect your GitHub repo
4. Set the port to 8080
5. Deploy

### Deploying to Render (free tier)

1. Create an account at render.com
2. Click New then Web Service
3. Connect your GitHub repository
4. Select Docker as the environment
5. Set the port to 8080
6. Deploy

### Connecting frontend to backend

Once your backend is deployed, update your Vercel environment variable:

| Variable | Value |
|----------|-------|
| NEXT_PUBLIC_API_URL | https://your-backend-url.com |
| NEXT_PUBLIC_ENABLE_MOCK_DATA | false |

Redeploy your Vercel project after changing these values.

---

## Part 3: Smart Contract on Stellar Testnet

### What you need

- The soroban CLI tool
- A Stellar testnet account with free test tokens

### Step 1: Install the soroban CLI

```bash
cargo install --locked soroban-cli
```

This will take a few minutes to compile.

### Step 2: Configure for testnet

```bash
soroban network add --global testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

### Step 3: Create a testnet identity

```bash
soroban keys generate --global alice --network testnet
```

This creates a keypair and funds it with free test XLM.

### Step 4: Build and deploy the contract

```bash
cd contracts/soroban-example

cargo build --release --target wasm32-unknown-unknown

soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/soroban_example.wasm \
  --source alice \
  --network testnet
```

The command will output a contract ID. Save this for later use.

### Step 5: Verify the deployment

```bash
soroban contract id --wasm target/wasm32-unknown-unknown/release/soroban_example.wasm
```

---

## Part 4: Environment Configuration

Create a file called `.env.local` in `apps/web/` with your settings:

```
# Backend API URL
# Leave empty to use mock data for development
# Set to your deployed backend URL for production
NEXT_PUBLIC_API_URL=

# Your application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Set to false when you have a real backend
NEXT_PUBLIC_ENABLE_MOCK_DATA=true
```

For the full list of browser-exposed and server-only settings, see the
[`docs/ENVIRONMENT_VARIABLES.md`](../../docs/ENVIRONMENT_VARIABLES.md)
reference.

---

## Part 5: Maintenance and Monitoring

### Check the build

```bash
cd apps/web
npm run build
```

### Run the development server

```bash
cd apps/web
npm run dev
```

Visit http://localhost:3000 to see the dashboard.

### Watch logs

On Vercel, logs are available in your project dashboard under Logs.
On Back4app or Render, logs are available in the container console.

### Common issues

1. **API returns 503**: The backend is not running or mock data is disabled
   and no backend URL is configured. Set NEXT_PUBLIC_ENABLE_MOCK_DATA=true
   during development.

2. **Build fails**: Make sure all dependencies are installed with
   `npm install` in the `apps/web` directory.

3. **Contract deployment fails**: Make sure soroban CLI is installed and
   you have configured the testnet network correctly. Check your internet
   connection and Stellar testnet status.

---

## Part 6: Architecture Overview

```
User Browser
     |
     v
Vercel (Next.js Frontend)
     |
     ├── /api/* (Next.js API Routes)
     |       |
     |       └── Backend API (Docker Container)
     |               |
     |               └── Rust Fuzzing Engine
     |
     ├── Dashboard (/) - Summary and stats
     ├── Runs (/runs) - Run history and management
     ├── Analytics (/analytics) - Charts and trends
     ├── Triage (/triage) - Failure classification
     ├── Logs (/logs) - System logs
     ├── Integrations (/integrations) - External services
     └── Settings (/settings) - Configuration
```

The Stellar Soroban contract is deployed independently on the Stellar
blockchain and can be tested through the CrashLab fuzzing engine.

---

Your platform is now live! Start by exploring the dashboard, then
configure your backend, and finally deploy your smart contract to testnet.
