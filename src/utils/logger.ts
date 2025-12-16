import chalk from 'chalk';

/**
 * Log levels in ascending order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
}

/**
 * Simple logger utility using chalk for colored output with configurable log levels
 */
export class Logger {
  private static instance: Logger;
  private currentLogLevel: LogLevel;

  private constructor() {
    // Default to INFO level, or DEBUG if DEBUG env var is set
    this.currentLogLevel = process.env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Set the current log level. Only messages at or above this level will be displayed.
   * @param level - The minimum log level to display
   */
  setLogLevel(level: LogLevel): void {
    this.currentLogLevel = level;
  }

  /**
   * Get the current log level
   * @returns The current log level
   */
  getLogLevel(): LogLevel {
    return this.currentLogLevel;
  }

  /**
   * Check if a message at the given level should be logged
   * @param level - The level to check
   * @returns True if the message should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.currentLogLevel;
  }

  /**
   * Log an informational message
   * @param message - The message to log
   */
  info(message: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(chalk.blue('ℹ'), message);
    }
  }

  /**
   * Log a success message (treated as INFO level)
   * @param message - The message to log
   */
  success(message: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(chalk.green('✓'), message);
    }
  }

  /**
   * Log a warning message
   * @param message - The message to log
   */
  warning(message: string): void {
    if (this.shouldLog(LogLevel.WARNING)) {
      console.log(chalk.yellow('⚠'), message);
    }
  }

  /**
   * Log an error message
   * @param message - The message to log
   * @param error - Optional error object to include
   */
  error(message: string, error?: Error): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(chalk.red('✗'), message);
      if (error) {
        console.error(chalk.red(error.message));
      }
    }
  }

  /**
   * Log a debug message
   * @param message - The message to log
   */
  debug(message: string): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(chalk.gray('→'), message);
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
