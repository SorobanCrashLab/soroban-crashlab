import { Command } from 'commander';
import { chalk, log } from '../utils/chalk.js';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  fix?: string;
  version?: string;
}

const MIN_VERSIONS = {
  node: '18.0.0',
  pnpm: '8.0.0',
  docker: '24.0.0',
};

function semverCompare(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

function getVersion(name: string): string | null {
  try {
    const output = execSync(`${name} --version`, { encoding: 'utf8' }).trim();
    // Normalize version output (some tools include 'v' prefix)
    return output.replace(/^v/, '');
  } catch {
    return null;
  }
}

function checkNode(): CheckResult {
  const version = getVersion('node');
  if (!version) {
    return {
      name: 'Node.js',
      status: 'fail',
      message: 'Node.js is not installed',
      fix: 'Install Node.js from https://nodejs.org/ (requires v18+ or usenvm/n) or run: curl -fsSL https://get.nvm.sh | bash && nvm install 20',
    };
  }
  if (semverCompare(version, MIN_VERSIONS.node) < 0) {
    return {
      name: 'Node.js',
      status: 'fail',
      message: `Node.js ${version} found, but v${MIN_VERSIONS.node}+ is required`,
      fix: 'Upgrade Node.js using nvm: nvm install 20 && nvm use 20',
      version,
    };
  }
  return {
    name: 'Node.js',
    status: 'pass',
    message: `v${version}`,
    version,
  };
}

function checkPnpm(): CheckResult {
  const version = getVersion('pnpm');
  if (!version) {
    return {
      name: 'pnpm',
      status: 'fail',
      message: 'pnpm is not installed',
      fix: 'Install pnpm: npm install -g pnpm or corepack enable && corepack prepare pnpm@latest --activate',
    };
  }
  if (semverCompare(version, MIN_VERSIONS.pnpm) < 0) {
    return {
      name: 'pnpm',
      status: 'fail',
      message: `pnpm ${version} found, but v${MIN_VERSIONS.pnpm}+ is required`,
      fix: 'Upgrade pnpm: pnpm add -g pnpm@latest',
      version,
    };
  }
  return {
    name: 'pnpm',
    status: 'pass',
    message: `v${version}`,
    version,
  };
}

function checkRust(): CheckResult {
  const version = getVersion('cargo');
  if (!version) {
    return {
      name: 'Rust/Cargo',
      status: 'warn',
      message: 'Rust/Cargo is not installed',
      fix: 'Optional: Install Rust for building contracts: curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh',
    };
  }
  return {
    name: 'Rust/Cargo',
    status: 'pass',
    message: `v${version}`,
    version,
  };
}

function checkDocker(): CheckResult {
  const version = getVersion('docker');
  if (!version) {
    return {
      name: 'Docker',
      status: 'warn',
      message: 'Docker is not installed',
      fix: 'Optional: Install Docker for containerized deployments: https://docs.docker.com/get-docker/',
    };
  }
  if (semverCompare(version, MIN_VERSIONS.docker.toString()) < 0) {
    return {
      name: 'Docker',
      status: 'warn',
      message: `Docker ${version} found, recommended v${MIN_VERSIONS.docker}+`,
      version,
    };
  }
  return {
    name: 'Docker',
    status: 'pass',
    message: `v${version}`,
    version,
  };
}

function checkPackageManager(): CheckResult {
  const lockfilePath = join(cwd(), 'package.json');
  const pnpmLockfile = join(cwd(), 'pnpm-lock.yaml');
  
  if (!existsSync(lockfilePath)) {
    return {
      name: 'Package Manager',
      status: 'fail',
      message: 'package.json not found',
      fix: 'Run this command from the project root directory',
    };
  }
  
  if (!existsSync(pnpmLockfile)) {
    return {
      name: 'Package Manager',
      status: 'warn',
      message: 'pnpm-lock.yaml not found',
      fix: 'Run: pnpm install --frozen-lockfile',
    };
  }
  
  return {
    name: 'Package Manager',
    status: 'pass',
    message: 'pnpm lockfile detected',
  };
}

function checkEnvVars(): CheckResult[] {
  const requiredVars = [
    { name: 'NEXT_PUBLIC_SUPABASE_URL', required: false },
    { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: false },
    { name: 'UPSTASH_REDIS_URL', required: false },
    { name: 'UPSTASH_REDIS_TOKEN', required: false },
    { name: 'NEXT_PUBLIC_API_URL', required: false },
  ];
  
  return requiredVars.map((env) => {
    const value = process.env[env.name];
    if (!value) {
      return {
        name: `Env: ${env.name}`,
        status: env.required ? 'fail' : 'warn',
        message: `Not set`,
        fix: env.required 
          ? `Set ${env.name} in your environment (e.g., in .env.local)`
          : `Optional: Set ${env.name} for full functionality`,
      };
    }
    return {
      name: `Env: ${env.name}`,
      status: 'pass',
      message: 'Configured',
    };
  });
}

function checkPorts(): CheckResult[] {
  const ports = [3000, 5432];
  const results: CheckResult[] = [];
  
  for (const port of ports) {
    try {
      const result = execSync(`lsof -i :${port} -t 2>/dev/null || echo ""`, { encoding: 'utf8' }).trim();
      if (result) {
        results.push({
          name: `Port ${port}`,
          status: 'warn',
          message: `In use by another process`,
          fix: `Terminate the process using port ${port} or change the port configuration`,
        });
      } else {
        results.push({
          name: `Port ${port}`,
          status: 'pass',
          message: 'Available',
        });
      }
    } catch {
      // lsof not available, skip
      results.push({
        name: `Port ${port}`,
        status: 'pass',
        message: 'Available (lsof not available to check)',
      });
    }
  }
  
  return results;
}

function checkDependencies(): CheckResult {
  const nodeModules = join(cwd(), 'node_modules');
  if (!existsSync(nodeModules)) {
    return {
      name: 'Dependencies',
      status: 'warn',
      message: 'node_modules not installed',
      fix: 'Run: pnpm install --frozen-lockfile',
    };
  }
  
  try {
    execSync('pnpm ls --depth 0', { encoding: 'utf8', stdio: 'pipe' });
    return {
      name: 'Dependencies',
      status: 'pass',
      message: 'Installed and verified',
    };
  } catch (error) {
    return {
      name: 'Dependencies',
      status: 'fail',
      message: 'Dependency check failed',
      fix: 'Run: pnpm install --frozen-lockfile',
    };
  }
}

async function checkTypeScript(): Promise<CheckResult> {
  try {
    execSync('npx tsc --noEmit', {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: join(cwd(), 'apps/web'),
    });
    return {
      name: 'TypeScript',
      status: 'pass',
      message: 'No type errors',
    };
  } catch (error) {
    return {
      name: 'TypeScript',
      status: 'fail',
      message: 'Type errors detected',
      fix: error && typeof error === 'object' && 'stdout' in error
        ? 'Fix TypeScript errors: check stdout' 
        : 'Run: pnpm --dir apps/web run build',
    };
  }
}

export function doctorCommand(): Command {
  return new Command('doctor')
    .description('Check development environment setup')
    .option('-q, --quiet', 'Only show failures')
    .action(async (options) => {
      console.log(chalk.bold('\n🩺  CrashLab Doctor - Environment Check\n'));
      
      const checks: CheckResult[] = [];
      
      // Version checks
      log.step('Checking versions...');
      checks.push(checkNode());
      checks.push(checkPnpm());
      checks.push(checkRust());
      checks.push(checkDocker());
      
      // Environment checks
      log.step('Checking environment...');
      checks.push(checkPackageManager());
      checks.push(...checkEnvVars());
      checks.push(...checkPorts());
      
      // Dependency checks
      log.step('Checking dependencies...');
      checks.push(checkDependencies());
      
      // TypeScript check
      log.step('Checking TypeScript...');
      checks.push(await checkTypeScript());
      
      console.log();
      
      let passCount = 0;
      let warnCount = 0;
      let failCount = 0;
      
      const passChecks: string[] = [];
      const warnChecks: string[] = [];
      const failChecks: string[] = [];
      
      for (const check of checks) {
        const line = `  ${check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗'} ${check.name}: ${check.message}`;
        
        if (check.status === 'pass') {
          passCount++;
          passChecks.push(line);
        } else if (check.status === 'warn') {
          warnCount++;
          warnChecks.push(line);
          if (check.fix) warnChecks.push(`    ↳ ${check.fix}`);
        } else {
          failCount++;
          failChecks.push(line);
          if (check.fix) failChecks.push(`    ↳ ${check.fix}`);
        }
      }
      
      if (!options.quiet) {
        if (passChecks.length > 0) {
          console.log(chalk.green.bold('\n✓ Passed: '));
          passChecks.forEach((line) => console.log(line));
        }
        if (warnChecks.length > 0) {
          console.log(chalk.yellow.bold('\n⚠ Warnings: '));
          warnChecks.forEach((line) => console.log(line));
        }
        if (failChecks.length > 0) {
          console.log(chalk.red.bold('\n✗ Failed: '));
          failChecks.forEach((line) => console.log(line));
        }
      }
      
      console.log(chalk.gray(`\n   Summary: ${passCount} passed, ${warnCount} warnings, ${failCount} failed`));
      
      if (failCount > 0) {
        console.log(chalk.red.bold('\n❌ Environment check failed. Please fix the issues above.\n'));
        process.exit(1);
      } else if (warnCount > 0) {
        console.log(chalk.yellow.bold('\n⚠ Environment check passed with warnings. You can continue, but some features may be limited.\n'));
        process.exit(0);
      } else {
        console.log(chalk.green.bold('\n✅ Environment check passed! You\'re ready to develop.\n'));
        process.exit(0);
      }
    });
}