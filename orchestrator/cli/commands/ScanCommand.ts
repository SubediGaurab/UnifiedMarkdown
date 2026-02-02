import { Command } from 'commander';
import path from 'path';
import {
  FileDiscoveryService,
  ScanResult,
} from '../../services/FileDiscoveryService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Format file size for display
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Print scan results summary
 */
function printSummary(result: ScanResult): void {
  console.log('\n📊 Scan Summary');
  console.log('─'.repeat(50));
  console.log(`  Directories scanned: ${result.directoriesScanned}`);
  console.log(`  Total files scanned: ${result.totalScanned}`);
  console.log(`  Convertible files:   ${result.files.length}`);
  console.log(`  ✅ Already converted: ${result.converted.length}`);
  console.log(`  ⏳ Pending:           ${result.pending.length}`);

  if (result.errors.length > 0) {
    console.log(`  ❌ Errors:            ${result.errors.length}`);
  }
  console.log('');
}

/**
 * Print detailed file list
 */
function printFileList(
  files: ScanResult['files'],
  title: string,
  showAll: boolean
): void {
  if (files.length === 0) return;

  console.log(`\n${title}`);
  console.log('─'.repeat(50));

  const displayFiles = showAll ? files : files.slice(0, 20);

  for (const file of displayFiles) {
    const status = file.hasMarkdown ? '✅' : '⏳';
    const size = formatSize(file.size);
    const relativePath = file.path;
    console.log(`  ${status} [${file.extension.toUpperCase()}] ${relativePath} (${size})`);
  }

  if (!showAll && files.length > 20) {
    console.log(`  ... and ${files.length - 20} more files`);
  }
  console.log('');
}

/**
 * Register the scan command
 */
export function registerScanCommand(program: Command): void {
  program
    .command('scan <directory>')
    .description('Scan a directory for files that can be converted to markdown')
    .option('-r, --recursive', 'Scan recursively (default: true)', true)
    .option('--no-recursive', 'Do not scan recursively')
    .option('-d, --max-depth <depth>', 'Maximum recursion depth', (val) => parseInt(val, 10))
    .option('-e, --extensions <exts>', 'Comma-separated list of extensions to include')
    .option('--pending-only', 'Only show files pending conversion')
    .option('--converted-only', 'Only show already converted files')
    .option('-a, --all', 'Show all files (not just first 20)')
    .option('--json', 'Output as JSON')
    .action(async (directory, options) => {
      try {
        const absolutePath = path.resolve(process.cwd(), directory);

        const discoveryOptions: any = {
          recursive: options.recursive,
        };

        if (options.maxDepth) {
          discoveryOptions.maxDepth = options.maxDepth;
        }

        if (options.extensions) {
          discoveryOptions.extensions = options.extensions
            .split(',')
            .map((e: string) => e.trim().toLowerCase());
        }

        const service = new FileDiscoveryService(discoveryOptions);
        const result = await service.scan(absolutePath);

        if (options.json) {
          // JSON output for programmatic use
          console.log(
            JSON.stringify(
              {
                ...result,
                files: result.files.map((f) => ({
                  ...f,
                  modifiedAt: f.modifiedAt.toISOString(),
                })),
                pending: result.pending.map((f) => ({
                  ...f,
                  modifiedAt: f.modifiedAt.toISOString(),
                })),
                converted: result.converted.map((f) => ({
                  ...f,
                  modifiedAt: f.modifiedAt.toISOString(),
                })),
              },
              null,
              2
            )
          );
          return;
        }

        // Human-readable output
        printSummary(result);

        if (options.pendingOnly) {
          printFileList(result.pending, '⏳ Pending Conversion:', options.all);
        } else if (options.convertedOnly) {
          printFileList(result.converted, '✅ Already Converted:', options.all);
        } else {
          printFileList(result.pending, '⏳ Pending Conversion:', options.all);
          if (result.converted.length > 0 && !options.pendingOnly) {
            console.log(
              `\n💡 Use --converted-only to see ${result.converted.length} already converted files`
            );
          }
        }

        if (result.pending.length > 0) {
          console.log(
            `\n💡 Run 'umd orchestrate convert ${directory}' to convert pending files`
          );
        }
      } catch (error) {
        logger.error(
          `Scan failed: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });
}
