import { Command } from 'commander';
import { ConversionStateService } from '../../services/ConversionStateService.js';

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Register the status command
 */
export function registerStatusCommand(program: Command): void {
  program
    .command('status [jobId]')
    .description('View status and logs for batch conversion jobs')
    .option('-a, --all', 'Show all jobs (not just the latest)')
    .option('--failed-only', 'Only show failed files')
    .option('--logs', 'Show full logs for each file')
    .option('--json', 'Output as JSON')
    .action(async (jobId, options) => {
      const stateService = new ConversionStateService();
      const batches = stateService.getAllBatches();

      if (batches.length === 0) {
        console.log('\n📭 No batch jobs found.\n');
        console.log('Run `umd orchestrate convert <directory>` to start a batch job.');
        return;
      }

      // If no jobId provided, show latest or list all
      if (!jobId) {
        if (options.all) {
          // List all jobs
          console.log('\n📋 All Batch Jobs');
          console.log('─'.repeat(70));
          
          for (const batch of batches.sort((a, b) => 
            b.createdAt.getTime() - a.createdAt.getTime()
          )) {
            const stats = stateService.getBatchStats(batch.jobId);
            const statusIcon = stats.failed > 0 ? '⚠️' : stats.pending > 0 ? '⏳' : '✅';
            console.log(
              `  ${statusIcon} ${batch.jobId} | ${batch.rootPath}`
            );
            console.log(
              `     Created: ${batch.createdAt.toLocaleString()} | ` +
              `✅ ${stats.completed} ❌ ${stats.failed} ⏳ ${stats.pending}`
            );
          }
          console.log('');
          console.log('💡 Run `umd orchestrate status <jobId>` to see details');
          return;
        } else {
          // Show latest job
          const latest = batches.sort((a, b) => 
            b.createdAt.getTime() - a.createdAt.getTime()
          )[0];
          jobId = latest.jobId;
        }
      }

      // Get specific job
      const batch = stateService.getBatch(jobId);
      if (!batch) {
        console.error(`\n❌ Job not found: ${jobId}`);
        console.log('\nAvailable jobs:');
        for (const b of batches) {
          console.log(`  - ${b.jobId}`);
        }
        return;
      }

      const stats = stateService.getBatchStats(jobId);
      const records = Array.from(batch.records.values());

      if (options.json) {
        console.log(JSON.stringify({
          jobId: batch.jobId,
          createdAt: batch.createdAt.toISOString(),
          rootPath: batch.rootPath,
          stats,
          records: records.map(r => ({
            ...r,
            startedAt: r.startedAt?.toISOString(),
            completedAt: r.completedAt?.toISOString(),
          })),
        }, null, 2));
        return;
      }

      // Human-readable output
      console.log('\n📊 Batch Job Status');
      console.log('─'.repeat(70));
      console.log(`  Job ID:    ${batch.jobId}`);
      console.log(`  Root Path: ${batch.rootPath}`);
      console.log(`  Created:   ${batch.createdAt.toLocaleString()}`);
      console.log('');
      console.log('  📈 Summary:');
      console.log(`     Total: ${stats.total} | ✅ Completed: ${stats.completed} | ❌ Failed: ${stats.failed} | ⏳ Pending: ${stats.pending}`);
      console.log('─'.repeat(70));

      // Filter records if needed
      const filteredRecords = options.failedOnly
        ? records.filter(r => r.status === 'failed')
        : records;

      if (filteredRecords.length === 0) {
        if (options.failedOnly) {
          console.log('\n✅ No failed files!\n');
        }
        return;
      }

      // Group by status
      const completed = filteredRecords.filter(r => r.status === 'completed');
      const failed = filteredRecords.filter(r => r.status === 'failed');
      const pending = filteredRecords.filter(r => r.status === 'pending');
      const inProgress = filteredRecords.filter(r => r.status === 'in-progress');

      // Show failed files first (most important)
      if (failed.length > 0) {
        console.log('\n❌ Failed Files:');
        console.log('─'.repeat(70));
        for (const record of failed) {
          console.log(`  📄 ${record.filePath}`);
          console.log(`     Duration: ${formatDuration(record.duration)}`);
          if (record.error) {
            console.log(`     Error: ${record.error.substring(0, 200)}`);
          }
          if (options.logs) {
            if (record.stdout) {
              console.log('     ─── stdout ───');
              console.log(record.stdout.split('\n').map(l => `     ${l}`).join('\n'));
            }
            if (record.stderr) {
              console.log('     ─── stderr ───');
              console.log(record.stderr.split('\n').map(l => `     ${l}`).join('\n'));
            }
          }
          console.log('');
        }
      }

      // Show completed files
      if (completed.length > 0 && !options.failedOnly) {
        console.log('\n✅ Completed Files:');
        console.log('─'.repeat(70));
        for (const record of completed) {
          console.log(`  📄 ${record.filePath} (${formatDuration(record.duration)})`);
          if (options.logs && (record.stdout || record.stderr)) {
            if (record.stdout) {
              console.log('     ─── stdout ───');
              console.log(record.stdout.split('\n').map(l => `     ${l}`).join('\n'));
            }
            if (record.stderr) {
              console.log('     ─── stderr ───');
              console.log(record.stderr.split('\n').map(l => `     ${l}`).join('\n'));
            }
            console.log('');
          }
        }
      }

      // Show in-progress
      if (inProgress.length > 0) {
        console.log('\n⏳ In Progress:');
        for (const record of inProgress) {
          console.log(`  📄 ${record.filePath}`);
        }
      }

      // Show pending
      if (pending.length > 0 && !options.failedOnly) {
        console.log(`\n⏳ Pending: ${pending.length} files`);
      }

      console.log('');

      if (!options.logs && failed.length > 0) {
        console.log('💡 Use --logs to see full output for each file');
      }
    });

  // Add clear command
  program
    .command('clear [jobId]')
    .description('Clear batch job state')
    .option('--all', 'Clear all jobs')
    .action(async (jobId, options) => {
      const stateService = new ConversionStateService();

      if (options.all) {
        stateService.clearAll();
        console.log('✅ Cleared all batch job state');
        return;
      }

      if (!jobId) {
        console.error('❌ Please provide a job ID or use --all');
        return;
      }

      stateService.clearBatch(jobId);
      console.log(`✅ Cleared job: ${jobId}`);
    });
}
