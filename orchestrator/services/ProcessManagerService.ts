import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../core/utils/logger.js';
import { DiscoveredFile } from './FileDiscoveryService.js';
import {
  ConversionStateService,
  ConversionStatus,
} from './ConversionStateService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Result of a single file conversion
 */
export interface ConversionResult {
  filePath: string;
  success: boolean;
  outputPath?: string;
  error?: string;
  duration: number; // milliseconds
  stdout: string;
  stderr: string;
}

/**
 * Options for batch conversion
 */
export interface BatchConvertOptions {
  /** Maximum concurrent conversions (default: 3) */
  concurrency?: number;
  /** Callback when a file starts processing */
  onStart?: (file: DiscoveredFile) => void;
  /** Callback when a file completes */
  onComplete?: (result: ConversionResult) => void;
  /** Callback for progress updates */
  onProgress?: (completed: number, total: number) => void;
  /** Whether to skip already converted files (default: true) */
  skipConverted?: boolean;
}

/**
 * Service for managing umd convert processes
 */
export class ProcessManagerService {
  private stateService: ConversionStateService;
  private activeProcesses: Map<string, ChildProcess>;
  private umdPath: string;

  constructor(stateService?: ConversionStateService) {
    this.stateService = stateService || new ConversionStateService();
    this.activeProcesses = new Map();

    // Resolve path to umd CLI
    // In production, use the globally installed umd command
    // For development, use the local dist
    this.umdPath = this.resolveUmdPath();
  }

  /**
   * Resolve the path to the umd CLI
   */
  private resolveUmdPath(): string {
    // Try to find local dist first (for development)
    const localPath = path.resolve(
      __dirname,
      '../../cli/cli.js'
    );
    return localPath;
  }

  /**
   * Maximum file size allowed for conversion (10MB)
   */
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024;

  /**
   * Convert a single file by spawning a umd process
   */
  async convertFile(file: DiscoveredFile): Promise<ConversionResult> {
    const startTime = Date.now();

    // Check file size limit
    if (file.size > ProcessManagerService.MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const error = `File size (${sizeMB}MB) exceeds maximum allowed size of 10MB`;
      logger.error(`Skipping conversion: ${file.path} - ${error}`);
      return {
        filePath: file.path,
        success: false,
        error,
        duration: Date.now() - startTime,
        stdout: '',
        stderr: '',
      };
    }

    return new Promise((resolve) => {
      logger.info(`Starting conversion: ${file.path}`);

      const process = spawn('node', [this.umdPath, 'convert', file.path], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcesses.set(file.path, process);

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        this.activeProcesses.delete(file.path);
        const duration = Date.now() - startTime;

        if (code === 0) {
          logger.info(`Completed conversion: ${file.path} (${duration}ms)`);
          resolve({
            filePath: file.path,
            success: true,
            outputPath: `${file.path}.md`,
            duration,
            stdout,
            stderr,
          });
        } else {
          const error = stderr || stdout || `Process exited with code ${code}`;
          logger.error(`Failed conversion: ${file.path} - ${error}`);
          resolve({
            filePath: file.path,
            success: false,
            error,
            duration,
            stdout,
            stderr,
          });
        }
      });

      process.on('error', (error) => {
        this.activeProcesses.delete(file.path);
        const duration = Date.now() - startTime;
        logger.error(`Process error for ${file.path}: ${error.message}`);
        resolve({
          filePath: file.path,
          success: false,
          error: error.message,
          duration,
          stdout,
          stderr,
        });
      });
    });
  }

  /**
   * Convert multiple files with concurrency control
   */
  async convertBatch(
    files: DiscoveredFile[],
    jobId: string,
    options: BatchConvertOptions = {}
  ): Promise<ConversionResult[]> {
    const {
      concurrency = 3,
      onStart,
      onComplete,
      onProgress,
      skipConverted = true,
    } = options;

    // Filter out already converted files if requested
    const filesToConvert = skipConverted
      ? files.filter((f) => !f.hasMarkdown)
      : files;

    if (filesToConvert.length === 0) {
      logger.info('No files to convert');
      return [];
    }

    logger.info(
      `Starting batch conversion: ${filesToConvert.length} files, concurrency: ${concurrency}`
    );

    // Initialize state for all files
    for (const file of filesToConvert) {
      this.stateService.addFile(jobId, file.path);
    }

    const results: ConversionResult[] = [];
    let completed = 0;

    // Process files with concurrency limit
    const queue = [...filesToConvert];

    const processNext = async (): Promise<void> => {
      const file = queue.shift();
      if (!file) return;

      onStart?.(file);
      this.stateService.updateStatus(jobId, file.path, 'in-progress');

      const result = await this.convertFile(file);
      results.push(result);

      const status: ConversionStatus = result.success ? 'completed' : 'failed';
      this.stateService.updateStatus(jobId, file.path, status, {
        error: result.error,
        outputPath: result.outputPath,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: result.duration,
      });

      completed++;
      onComplete?.(result);
      onProgress?.(completed, filesToConvert.length);

      // Process next file in queue
      await processNext();
    };

    // Start initial batch of concurrent workers
    const workers = Array(Math.min(concurrency, queue.length))
      .fill(null)
      .map(() => processNext());

    await Promise.all(workers);

    logger.info(`Batch conversion complete: ${results.length} files processed`);

    return results;
  }

  /**
   * Cancel all active conversions
   */
  cancelAll(): void {
    for (const [filePath, process] of this.activeProcesses.entries()) {
      logger.info(`Cancelling conversion: ${filePath}`);
      process.kill('SIGTERM');
    }
    this.activeProcesses.clear();
  }

  /**
   * Get count of active conversions
   */
  getActiveCount(): number {
    return this.activeProcesses.size;
  }
}
