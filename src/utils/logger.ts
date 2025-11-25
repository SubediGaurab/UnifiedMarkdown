import chalk from 'chalk';

/**
 * Simple logger utility using chalk for colored output
 */
export class Logger {
  private static instance: Logger;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }

  success(message: string): void {
    console.log(chalk.green('✓'), message);
  }

  warning(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  }

  error(message: string, error?: Error): void {
    console.error(chalk.red('✗'), message);
    if (error) {
      console.error(chalk.red(error.message));
    }
  }

  debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(chalk.gray('→'), message);
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
