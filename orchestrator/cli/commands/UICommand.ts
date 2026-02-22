import { Command } from 'commander';
import chalk from 'chalk';
import { UIServerService } from '../../ui/server/UIServerService.js';
import { UIConfig } from '../../../core/interfaces/IConfig.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Register the UI command
 */
export function registerUICommand(parent: Command): void {
  parent
    .command('ui')
    .description('Start the web-based UI server for file management and conversion')
    .option('-p, --port <number>', 'Port to run the server on', '3000')
    .option('-h, --host <string>', 'Host to bind to', 'localhost')
    .option('-o, --open', 'Open browser automatically on start', false)
    .option(
      '--frontend-dev-url <url>',
      'Frontend dev server URL (redirect non-API routes here during development)'
    )
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(chalk.red('Error: Invalid port number'));
        process.exit(1);
      }

      let frontendDevUrl: string | undefined;
      if (typeof options.frontendDevUrl === 'string' && options.frontendDevUrl.trim().length > 0) {
        try {
          frontendDevUrl = new URL(options.frontendDevUrl.trim()).toString();
        } catch {
          console.error(chalk.red('Error: Invalid --frontend-dev-url. Expected a full URL like http://localhost:5173'));
          process.exit(1);
        }
      }

      const uiConfig: UIConfig = {
        port,
        host: options.host,
        openBrowserOnStart: options.open,
        frontendDevUrl,
      };

      console.log(chalk.cyan('\n╭─────────────────────────────────────────╮'));
      console.log(chalk.cyan('│') + chalk.bold.white('   UnifiedMarkdown UI Server            ') + chalk.cyan('│'));
      console.log(chalk.cyan('╰─────────────────────────────────────────╯\n'));

      const server = new UIServerService(uiConfig);

      // Handle shutdown gracefully
      let shuttingDown = false;
      const shutdown = async (signal: string) => {
        if (shuttingDown) {
          console.log(chalk.red('\nForcing exit...'));
          process.exit(1);
        }
        shuttingDown = true;
        console.log(chalk.yellow(`\nReceived ${signal}. Shutting down gracefully...`));
        console.log(chalk.gray('(Press Ctrl+C again to force exit)'));
        await server.stop();
        process.exit(0);
      };

      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));

      try {
        await server.start();

        console.log(chalk.gray('Press Ctrl+C to stop the server\n'));
        console.log(chalk.white('Available API endpoints:'));
        console.log(chalk.gray('  Scanning:'));
        console.log(chalk.green('    POST') + chalk.white(' /api/scan') + chalk.gray(' - Scan a directory'));
        console.log(chalk.blue('    GET ') + chalk.white(' /api/scan/result') + chalk.gray(' - Get cached scan results'));
        console.log(chalk.gray('  Conversion:'));
        console.log(chalk.green('    POST') + chalk.white(' /api/convert') + chalk.gray(' - Start batch conversion'));
        console.log(chalk.blue('    GET ') + chalk.white(' /api/convert/status/:jobId') + chalk.gray(' - Get job status'));
        console.log(chalk.blue('    GET ') + chalk.white(' /api/convert/logs/:jobId/:fileIndex') + chalk.gray(' - Get file logs'));
        console.log(chalk.green('    POST') + chalk.white(' /api/convert/cancel/:jobId') + chalk.gray(' - Cancel job'));
        console.log(chalk.gray('  Exclusions:'));
        console.log(chalk.blue('    GET ') + chalk.white(' /api/exclusions') + chalk.gray(' - List exclusion rules'));
        console.log(chalk.green('    POST') + chalk.white(' /api/exclusions') + chalk.gray(' - Add exclusion rule'));
        console.log(chalk.red('    DEL ') + chalk.white(' /api/exclusions/:id') + chalk.gray(' - Remove exclusion'));
        console.log(chalk.gray('  Events:'));
        console.log(chalk.blue('    GET ') + chalk.white(' /api/events') + chalk.gray(' - SSE event stream'));
        console.log('');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to start server: ${message}`);
        process.exit(1);
      }
    });
}
