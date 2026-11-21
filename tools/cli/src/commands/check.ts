import { Command } from 'commander';
import { chalk } from '../utils/chalk.js';

export function checkCommand(): Command {
  return new Command('check')
    .description('Quick environment check')
    .action(() => {
      console.log(chalk.bold('\n✓ Environment check\n'));
      console.log('  Node:', process.version);
      console.log('  Platform:', process.platform);
      console.log('  Working directory:', process.cwd());
      console.log();
    });
}