import { Command } from 'commander';
import { chalk, log } from '../utils/chalk.js';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { createInterface } from 'node:readline';
const GOOD_FIRST_ISSUES = [
    { id: 1, title: 'Add unit tests for a utility function', labels: ['type:task', 'good first issue'], difficulty: 'Beginner' },
    { id: 2, title: 'Improve documentation for a module', labels: ['documentation', 'good first issue'], difficulty: 'Beginner' },
    { id: 3, title: 'Fix a small bug in the dashboard', labels: ['bug', 'good first issue'], difficulty: 'Beginner' },
    { id: 4, title: 'Add example to the pattern catalog', labels: ['documentation', 'good first issue'], difficulty: 'Beginner' },
    { id: 5, title: 'Create a new component following conventions', labels: ['component', 'good first issue'], difficulty: 'Beginner' },
];
async function runCommand(command, args, options) {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: options?.cwd ?? cwd(),
            stdio: 'inherit',
            shell: process.platform !== 'win32',
        });
        child.on('close', (code) => resolve(code === 0));
        child.on('error', () => resolve(false));
    });
}
async function checkGit() {
    try {
        const result = spawn('git', ['rev-parse', '--git-dir'], {
            cwd: cwd(),
            stdio: ['ignore', 'pipe', 'ignore'],
            shell: process.platform !== 'win32',
        });
        return await new Promise((resolve) => {
            result.on('close', (code) => resolve(code === 0));
            result.on('error', () => resolve(false));
        });
    }
    catch {
        return false;
    }
}
async function runTests() {
    log.step('Running tests...');
    const success = await runCommand('pnpm', ['--dir', 'apps/web', 'run', 'test'], {
        cwd: join(cwd(), 'apps/web'),
    });
    return success;
}
async function runLint() {
    log.step('Running linter...');
    const success = await runCommand('pnpm', ['--dir', 'apps/web', 'run', 'lint'], {
        cwd: join(cwd(), 'apps/web'),
    });
    return success;
}
async function runTypeCheck() {
    log.step('Running type check...');
    const success = await runCommand('pnpm', ['--dir', 'apps/web', 'run', 'typecheck'], {
        cwd: join(cwd(), 'apps/web'),
    });
    return success;
}
function pickIssue() {
    console.log(chalk.bold('\n📋 Good First Issues\n'));
    GOOD_FIRST_ISSUES.forEach((issue) => {
        console.log(chalk.green(`  #${issue.id}`));
        console.log(`      ${issue.title}`);
        console.log(`      Labels: ${issue.labels.join(', ')}  Difficulty: ${issue.difficulty}`);
        console.log();
    });
}
async function promptIssueSelection() {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question('\nWhich issue number would you like to work on? (or press Enter to skip): ', (answer) => {
            rl.close();
            const num = parseInt(answer.trim(), 10);
            if (!isNaN(num) && num >= 1 && num <= GOOD_FIRST_ISSUES.length) {
                resolve(num);
            }
            else {
                resolve(null);
            }
        });
    });
}
async function createBranch(issueNumber) {
    const title = GOOD_FIRST_ISSUES.find((i) => i.id === issueNumber)?.title ?? 'feature';
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const branchName = `issue/${issueNumber}-${slug}`;
    log.step(`Creating branch: ${branchName}`);
    const success = await runCommand('git', ['checkout', '-b', branchName]);
    if (success) {
        log.success(`Created branch: ${branchName}`);
        log.info(`\nNext steps:`);
        log.info(`  1. Implement your changes`);
        log.info(`  2. git add .`);
        log.info(`  3. git commit -m "feat: ${title}"`);
        log.info(`  4. git push -u origin ${branchName}`);
        log.info(`  5. Open a pull request\n`);
    }
    else {
        log.error('Failed to create branch. Make sure you are in a git repository.');
    }
}
export function onboardCommand() {
    return new Command('onboard')
        .description('Interactive onboarding for new contributors')
        .option('--skip-setup', 'Skip the setup verification')
        .option('--skip-tests', 'Skip running tests')
        .option('--skip-issue', 'Skip the issue selection')
        .option('--interactive', 'Force interactive mode (default: auto-detect)')
        .action(async (options) => {
        console.log(chalk.bold('\n👋 Welcome to CrashLab Developer Onboarding\n'));
        // Check if we're running interactively
        const isInteractive = options.interactive ?? process.stdout.isTTY;
        // Step 1: Verify environment
        if (!options.skipSetup) {
            log.step('Step 1: Verifying environment...');
            const hasGit = await checkGit();
            if (!hasGit) {
                log.error('Git is not configured properly in this directory.');
                log.info('Please initialize a git repository or run this from the project root.');
                process.exit(1);
            }
            log.success('Environment verified! ✅');
        }
        else {
            console.log(chalk.gray('(Skipping setup verification)'));
        }
        // Step 2: Run tests
        if (!options.skipTests) {
            log.step('Step 2: Running tests...');
            console.log(chalk.gray('Running lint, typecheck, and unit tests...\n'));
            const lintSuccess = await runLint();
            if (!lintSuccess) {
                log.warning('Lint check failed. Please fix the issues above.');
            }
            const typeCheckSuccess = await runTypeCheck();
            if (!typeCheckSuccess) {
                log.warning('Type check failed. Please fix the issues above.');
            }
            const testSuccess = await runTests();
            if (!testSuccess) {
                log.warning('Tests failed. Please fix the issues above.');
            }
            if (lintSuccess && typeCheckSuccess && testSuccess) {
                log.success('All checks passed! ✅');
            }
            else {
                log.info('Some checks failed. Please fix them before proceeding.');
            }
        }
        else {
            console.log(chalk.gray('(Skipping tests)'));
        }
        // Step 3: Tour the codebase
        log.step('Step 3: Codebase Tour');
        console.log(chalk.gray('\nKey directories:'));
        console.log(chalk.gray('  apps/web/src/app/     - Main application pages'));
        console.log(chalk.gray('  apps/web/src/components/ - Reusable UI components'));
        console.log(chalk.gray('  apps/web/src/lib/     - Business logic and utilities'));
        console.log(chalk.gray('  apps/web/src/hooks/   - React hooks'));
        console.log(chalk.gray('  tools/cli/           - This CLI tool\n'));
        // Step 4: Pick an issue (interactive only)
        if (!options.skipIssue && isInteractive) {
            console.log(chalk.bold('\n📋 Pick a Good First Issue\n'));
            pickIssue();
            const issueNumber = await promptIssueSelection();
            if (issueNumber) {
                await createBranch(issueNumber);
            }
            else {
                log.info('Skipping issue selection. Browse issues at: https://github.com/SorobanCrashLab/soroban-crashlab/issues\n');
            }
        }
        else if (!options.skipIssue) {
            console.log(chalk.gray('(Skipping issue selection - non-interactive mode)'));
            log.info('View issues at: https://github.com/SorobanCrashLab/soroban-crashlab/issues\n');
        }
        else {
            console.log(chalk.gray('(Skipping issue selection)'));
        }
        console.log(chalk.bold('\n🎉 Onboarding Complete!\n'));
        log.info('You\'re ready to contribute. Happy coding! 🚀');
    });
}
