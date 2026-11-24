import chalk from 'chalk';
export { chalk };
export const log = {
    info: (message) => console.log(chalk.cyan(message)),
    success: (message) => console.log(chalk.green(message)),
    warning: (message) => console.log(chalk.yellow(message)),
    error: (message) => console.log(chalk.red(message)),
    step: (message) => console.log(chalk.blue(message)),
    code: (message) => console.log(chalk.magenta(message)),
};
