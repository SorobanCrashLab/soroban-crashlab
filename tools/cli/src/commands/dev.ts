import { Command } from 'commander';
import { chalk, log } from '../utils/chalk.js';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { cwd } from 'node:process';

interface DevOptions {
  port?: string;
  host?: string;
  active?: boolean;
  readonly?: boolean;
  'no-lint'?: boolean;
  'no-check'?: boolean;
}

export function devCommand(): Command {
  return new Command('dev')
    .description('Start the development server')
    .option('-p, --port <port>', 'Port to run the dev server on', '3000')
    .option('-h, --host <host>', 'Host to bind the dev server to', 'localhost')
    .option('--active', 'Enable React Server Components streaming')
    .option('--readonly', 'Use readonly Redis instance (no data mutation)')
    .option('--no-lint', 'Skip linting during development')
    .option('--no-check', 'Skip TypeScript type checking')
    .action(async (options: DevOptions) => {
      console.log(chalk.bold('\n🚀 Starting CrashLab Development Server\n'));
      
      // Check if we're in the right directory
      const webDir = join(cwd(), 'apps/web');
      const packageJsonPath = join(webDir, 'package.json');
      
      try {
        const fs = await import('node:fs');
        if (!fs.existsSync(packageJsonPath)) {
          log.error('Could not find apps/web/package.json');
          log.info('Please run this command from the repository root.');
          process.exit(1);
        }
      } catch {
        log.error('Could not access apps/web directory.');
        process.exit(1);
      }
      
      const portNum = parseInt(options.port ?? '3000', 10);
      
      // Build environment variables
      const env = { ...process.env };
      
      if (portNum) {
        env.NEXT_PUBLIC_PORT = String(portNum);
      }
      
      if (options.readonly) {
        env.NEXT_PUBLIC_READONLY = 'true';
        log.info('Readonly mode enabled');
      }
      
      if (options.active) {
        env.NEXT_PUBLIC_RSC_ACTIVE = 'true';
        log.info('RSC streaming enabled');
      }
      
      // Build command
      const args = ['--dir', 'apps/web', 'run', 'dev'];
      
      if (options.host && portNum) {
        args.push('--port', String(portNum));
      }
      
      if (!options['no-lint'] && !options['no-check']) {
        // Default: run with lint and check
        if (!options.host) {
          args.push('--port', String(portNum));
        }
      } else {
        if (options['no-lint']) args.push('--no-lint');
        if (options['no-check']) args.push('--no-check');
      }
      
      log.step('Starting Next.js development server...');
      console.log(chalk.gray(`  Working directory: ${webDir}`));
      console.log(chalk.gray(`  Port: ${portNum}`));
      console.log(chalk.gray(`  URL: http://localhost:${portNum}\n`));
      
      // Spawn the dev process
      const child = spawn('pnpm', args, {
        cwd: cwd(),
        stdio: 'inherit',
        env,
        shell: process.platform !== 'win32',
      });
      
      child.on('error', (err) => {
        log.error(`Failed to start development server: ${err.message}`);
        process.exit(1);
      });
      
      child.on('exit', (code) => {
        if (code !== 0) {
          log.error(`Development server exited with code ${code}`);
          process.exit(code);
        }
      });
      
      // Handle termination signals
      const handleSignal = () => {
        log.info('\nShutting down development server...');
        child.kill();
        process.exit(0);
      };
      
      process.on('SIGINT', handleSignal);
      process.on('SIGTERM', handleSignal);
    });
}