import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../core/utils/logger.js';

/**
 * Status of a file conversion
 */
export type ConversionStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Record of a file conversion attempt
 */
export interface ConversionRecord {
  /** Absolute path to the source file */
  filePath: string;
  /** Current status */
  status: ConversionStatus;
  /** When the conversion started */
  startedAt?: Date;
  /** When the conversion completed (success or failure) */
  completedAt?: Date;
  /** Error message if failed */
  error?: string;
  /** Path to the generated markdown file */
  outputPath?: string;
  /** Captured stdout from the conversion process */
  stdout?: string;
  /** Captured stderr from the conversion process */
  stderr?: string;
  /** Duration in milliseconds */
  duration?: number;
}

/**
 * State of a batch conversion job
 */
export interface BatchState {
  /** Unique job identifier */
  jobId: string;
  /** When the job was created */
  createdAt: Date;
  /** Root path that was scanned */
  rootPath: string;
  /** All file records in this batch */
  records: Map<string, ConversionRecord>;
}

/**
 * Service for tracking conversion state across sessions
 * Persists state to ~/.umd/orchestrator-state.json
 */
export class ConversionStateService {
  private stateFilePath: string;
  private state: Map<string, BatchState>;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const configDir = path.join(homeDir, '.umd');
    this.stateFilePath = path.join(configDir, 'orchestrator-state.json');
    this.state = new Map();
    this.loadState();
  }

  /**
   * Create a new batch job
   */
  createBatch(jobId: string, rootPath: string): BatchState {
    const batch: BatchState = {
      jobId,
      createdAt: new Date(),
      rootPath,
      records: new Map(),
    };
    this.state.set(jobId, batch);
    this.saveState();
    return batch;
  }

  /**
   * Get a batch by ID
   */
  getBatch(jobId: string): BatchState | undefined {
    return this.state.get(jobId);
  }

  /**
   * Get all batches
   */
  getAllBatches(): BatchState[] {
    return Array.from(this.state.values());
  }

  /**
   * Add a file to a batch
   */
  addFile(jobId: string, filePath: string): ConversionRecord {
    const batch = this.state.get(jobId);
    if (!batch) {
      throw new Error(`Batch not found: ${jobId}`);
    }

    const record: ConversionRecord = {
      filePath,
      status: 'pending',
    };
    batch.records.set(filePath, record);
    this.saveState();
    return record;
  }

  /**
   * Update file status
   */
  updateStatus(
    jobId: string,
    filePath: string,
    status: ConversionStatus,
    details?: {
      error?: string;
      outputPath?: string;
      stdout?: string;
      stderr?: string;
      duration?: number;
    }
  ): void {
    const batch = this.state.get(jobId);
    if (!batch) {
      throw new Error(`Batch not found: ${jobId}`);
    }

    const record = batch.records.get(filePath);
    if (!record) {
      throw new Error(`File not found in batch: ${filePath}`);
    }

    record.status = status;

    if (status === 'in-progress') {
      record.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed' || status === 'skipped') {
      record.completedAt = new Date();
    }

    if (details?.error) {
      record.error = details.error;
    }

    if (details?.outputPath) {
      record.outputPath = details.outputPath;
    }

    if (details?.stdout) {
      record.stdout = details.stdout;
    }

    if (details?.stderr) {
      record.stderr = details.stderr;
    }

    if (details?.duration) {
      record.duration = details.duration;
    }

    this.saveState();
  }

  /**
   * Get batch statistics
   */
  getBatchStats(jobId: string): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    skipped: number;
  } {
    const batch = this.state.get(jobId);
    if (!batch) {
      throw new Error(`Batch not found: ${jobId}`);
    }

    const stats = {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    };

    for (const record of batch.records.values()) {
      stats.total++;
      switch (record.status) {
        case 'pending':
          stats.pending++;
          break;
        case 'in-progress':
          stats.inProgress++;
          break;
        case 'completed':
          stats.completed++;
          break;
        case 'failed':
          stats.failed++;
          break;
        case 'skipped':
          stats.skipped++;
          break;
      }
    }

    return stats;
  }

  /**
   * Clear a batch
   */
  clearBatch(jobId: string): void {
    this.state.delete(jobId);
    this.saveState();
  }

  /**
   * Clear all state
   */
  clearAll(): void {
    this.state.clear();
    this.saveState();
  }

  /**
   * Load state from disk
   */
  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed = JSON.parse(data);

        for (const [jobId, batchData] of Object.entries(parsed)) {
          const batch = batchData as any;
          const records = new Map<string, ConversionRecord>();

          for (const [filePath, recordData] of Object.entries(
            batch.records || {}
          )) {
            const r = recordData as any;
            const record: ConversionRecord = {
              filePath: r.filePath,
              status: r.status,
              startedAt: r.startedAt ? new Date(r.startedAt) : undefined,
              completedAt: r.completedAt ? new Date(r.completedAt) : undefined,
              error: r.error,
              outputPath: r.outputPath,
              stdout: r.stdout,
              stderr: r.stderr,
              duration: r.duration,
            };
            records.set(filePath, record);
          }

          this.state.set(jobId, {
            jobId: batch.jobId,
            createdAt: new Date(batch.createdAt),
            rootPath: batch.rootPath,
            records,
          });
        }

        logger.info(`Loaded ${this.state.size} batch(es) from state`);
      }
    } catch (error) {
      logger.error(
        `Failed to load state: ${error instanceof Error ? error.message : String(error)}`
      );
      this.state = new Map();
    }
  }

  /**
   * Save state to disk
   */
  private saveState(): void {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const serialized: Record<string, any> = {};

      for (const [jobId, batch] of this.state.entries()) {
        const records: Record<string, ConversionRecord> = {};
        for (const [filePath, record] of batch.records.entries()) {
          records[filePath] = record;
        }

        serialized[jobId] = {
          jobId: batch.jobId,
          createdAt: batch.createdAt.toISOString(),
          rootPath: batch.rootPath,
          records,
        };
      }

      fs.writeFileSync(
        this.stateFilePath,
        JSON.stringify(serialized, null, 2),
        'utf-8'
      );
    } catch (error) {
      logger.error(
        `Failed to save state: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
