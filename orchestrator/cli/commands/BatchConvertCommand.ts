import { Command } from 'commander';
import path from 'path';
import ora from 'ora';
import { FileDiscoveryService } from '../../services/FileDiscoveryService.js';
import { ConversionStateService } from '../../services/ConversionStateService.js';
import { ProcessManagerService } from '../../services/ProcessManagerService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `batch-${timestamp}-${random}`;
}

/**
 * Register the batch convert command
 */
export function registerBatchConvertCommand(program: Command): void {
  program
    .command('convert <directory>')
    .description('Convert all pending files in a directory to markdown')
    .option('-c, --concurrency <num>', 'Number of concurrent conversions', (val) => parseInt(val, 10), 10)
    .option('--include-converted', 'Re-convert files that already have markdown')
    .option('-r, --recursive', 'Scan recursively (default: true)', true)
    .option('--no-recursive', 'Do not scan recursively')
    .option('-d, --max-depth <depth>', 'Maximum recursion depth', (val) => parseInt(val, 10))
    .option('-e, --extensions <exts>', 'Comma-separated list of extensions to include')
    .option('--dry-run', 'Show what would be converted without actually converting')
    .action(async (directory, options) => {
      try {
        const absolutePath = path.resolve(process.cwd(), directory);

        // First, scan for files
        const scanSpinner = ora('Scanning for files...').start();

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

        const discoveryService = new FileDiscoveryService(discoveryOptions);
        const scanResult = await discoveryService.scan(absolutePath);

        scanSpinner.succeed(
          `Found ${scanResult.files.length} files (${scanResult.pending.length} pending)`
        );

        const filesToConvert = options.includeConverted
          ? scanResult.files
          : scanResult.pending;

        if (filesToConvert.length === 0) {
          console.log('\n✅ No files to convert. All files are already converted!');
          return;
        }

        if (options.dryRun) {
          console.log('\n📋 Dry run - would convert these files:');
          console.log('─'.repeat(50));
          for (const file of filesToConvert) {
            console.log(`  ${file.path}`);
          }
          console.log(`\nTotal: ${filesToConvert.length} files`);
          console.log(
            "\n💡 Remove --dry-run to actually convert these files"
          );
          return;
        }

        // Create batch job
        const stateService = new ConversionStateService();
        const processManager = new ProcessManagerService(stateService);
        const jobId = generateJobId();

        stateService.createBatch(jobId, absolutePath);

        console.log(`\n🚀 Starting batch conversion (Job ID: ${jobId})`);
        console.log(`   Concurrency: ${options.concurrency}`);
        console.log(`   Files: ${filesToConvert.length}`);
        console.log('─'.repeat(50));

        let completed = 0;
        let succeeded = 0;
        let failed = 0;
        const startTime = Date.now();

        // Progress spinner
        const progressSpinner = ora(
          `Converting... 0/${filesToConvert.length}`
        ).start();

        const results = await processManager.convertBatch(
          filesToConvert,
          jobId,
          {
            concurrency: options.concurrency,
            skipConverted: !options.includeConverted,
            onProgress: (done, total) => {
              progressSpinner.text = `Converting... ${done}/${total}`;
            },
            onComplete: (result) => {
              completed++;
              if (result.success) {
                succeeded++;
              } else {
                failed++;
              }
            },
          }
        );

        progressSpinner.stop();

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log('\n📊 Batch Conversion Complete');
        console.log('─'.repeat(50));
        console.log(`  ✅ Succeeded: ${succeeded}`);
        console.log(`  ❌ Failed:    ${failed}`);
        console.log(`  ⏱️  Duration:  ${duration}s`);

        if (failed > 0) {
          console.log('\n❌ Failed files:');
          for (const result of results.filter((r) => !r.success)) {
            console.log(`  - ${result.filePath}`);
            if (result.error) {
              console.log(`    Error: ${result.error.substring(0, 100)}`);
            }
          }
        }

        console.log(`\n💾 State saved for job: ${jobId}`);
      } catch (error) {
        logger.error(
          `Batch conversion failed: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });
}
