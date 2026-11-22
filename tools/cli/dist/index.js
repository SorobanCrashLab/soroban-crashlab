#!/usr/bin/env node
import { Command } from 'commander';
import { chalk } from './utils/chalk.js';
import { checkCommand } from './commands/check.js';
import { doctorCommand } from './commands/doctor.js';
import { devCommand } from './commands/dev.js';
import { generateCommand } from './commands/generate.js';
import { onboardCommand } from './commands/onboard.js';
import { seedCommand } from './commands/seed.js';
import { scaffoldCommand } from './commands/scaffold.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const version = packageJson.version || '1.0.0';
const program = new Command();
program
    .name('crashlab')
    .description('Unified CLI tool for the Soroban CrashLab Developer Experience Platform')
    .version(version);
// Add commands
program.addCommand(doctorCommand());
program.addCommand(devCommand());
program.addCommand(scaffoldCommand());
program.addCommand(generateCommand());
program.addCommand(seedCommand());
program.addCommand(onboardCommand());
program.addCommand(checkCommand());
// Handle unknown commands
program.on('command:*', (operands) => {
    console.error(chalk.red(`\n✖ Unknown command: ${operands[0]}`));
    console.error(`  Run "crashlab --help" for a list of available commands.\n`);
    process.exit(1);
});
// Parse arguments
program.parse(process.argv);
