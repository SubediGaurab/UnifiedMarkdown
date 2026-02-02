import { Command } from 'commander';
import { registerScanCommand } from './cli/commands/ScanCommand.js';
import { registerBatchConvertCommand } from './cli/commands/BatchConvertCommand.js';
import { registerStatusCommand } from './cli/commands/StatusCommand.js';

// Re-export services for programmatic use (future UI)
export { FileDiscoveryService } from './services/FileDiscoveryService.js';
export { ConversionStateService } from './services/ConversionStateService.js';
export { ProcessManagerService } from './services/ProcessManagerService.js';

export type { DiscoveredFile, ScanResult, ScanOptions } from './services/FileDiscoveryService.js';
export type { ConversionRecord, BatchState, ConversionStatus } from './services/ConversionStateService.js';
export type { ConversionResult, BatchConvertOptions } from './services/ProcessManagerService.js';

/**
 * Register the orchestrate command with all its subcommands
 */
export function registerOrchestrateCommand(program: Command): void {
  const orchestrate = program
    .command('orchestrate')
    .alias('orch')
    .description('Batch orchestration for converting multiple files');

  registerScanCommand(orchestrate);
  registerBatchConvertCommand(orchestrate);
  registerStatusCommand(orchestrate);
}
