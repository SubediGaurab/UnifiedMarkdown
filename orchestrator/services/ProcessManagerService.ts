import spawn from 'cross-spawn';
import { ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../core/utils/logger.js';
import { DiscoveredFile } from './FileDiscoveryService.js';
import {
  ConversionStateService,
  ConversionStatus,
} from './ConversionStateService.js';
import { SkillsService } from './SkillsService.js';

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
  /** Use Claude Code with convert-to-markdown skill instead of standard UMD conversion */
  useClaudeCode?: boolean;
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
   * Maximum file size allowed for conversion (25MB)
   */
  private static readonly MAX_FILE_SIZE = 25 * 1024 * 1024;

  /**
   * Convert a single file by spawning a umd process
   */
  async convertFile(file: DiscoveredFile): Promise<ConversionResult> {
    const startTime = Date.now();

    // Check file size limit
    if (file.size > ProcessManagerService.MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const error = `File size (${sizeMB}MB) exceeds maximum allowed size of 25MB`;
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
   * Convert a single file using Claude Code with the convert-to-markdown skill
   * Claude Code is invoked in headless mode with --print flag and opus model
   * @param file The file to convert
   * @param workingDir The working directory to run Claude Code from (should be common parent of all files)
   */
  async convertFileWithClaudeCode(file: DiscoveredFile, workingDir: string): Promise<ConversionResult> {
    const startTime = Date.now();

    // Check file size limit
    if (file.size > ProcessManagerService.MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const error = `File size (${sizeMB}MB) exceeds maximum allowed size of 25MB`;
      logger.error(`Skipping Claude Code conversion: ${file.path} - ${error}`);
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
      logger.info(`Starting Claude Code conversion: ${file.path}`);

      // Verify skills are available at user level before proceeding
      const skillsVerification = SkillsService.verifyClaudeCodeSkills();
      if (!skillsVerification.valid) {
        const error = `Missing required skills: ${skillsVerification.missing.join(', ')}. Run 'umd install-skills' or reinstall the package.`;
        logger.error(error);
        resolve({
          filePath: file.path,
          success: false,
          error,
          duration: Date.now() - startTime,
          stdout: '',
          stderr: '',
        });
        return;
      }

      // Spawn claude in headless mode with opus model and dangerously-skip-permissions
      // Skills are loaded from ~/.claude/skills (user level)
      // Working directory is the common parent of all files being converted
      logger.debug(`Using Claude Code from working directory: ${workingDir}`);

      // Get the claude executable path - check ~/.local/bin first (standard installation location)
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const claudeLocalBin = path.join(homeDir, '.local', 'bin');

      // Add ~/.local/bin to PATH for the spawned process
      const envPath = process.env.PATH || '';
      const enhancedPath = `${claudeLocalBin}${path.delimiter}${envPath}`;

      // Build the prompt - use forward slashes for cross-platform compatibility
      // Use single quotes around the path inside the prompt (double quotes wrap the whole -p argument)
      const normalizedPath = file.path.replace(/\\/g, '/');
      const prompt = `Use the convert-to-markdown skill to convert this file to markdown: '${normalizedPath}'`;

      // Build the full command for logging
      const args = [
        '-p', prompt,
        '--model', 'opus',
        '--dangerously-skip-permissions',
        '--output-format', 'text'
      ];
      const fullCommand = `claude ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`;
      logger.info(`Claude Code command: ${fullCommand}`);
      logger.info(`Working directory: ${workingDir}`);

      const childProcess = spawn('claude', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: workingDir, // Common parent directory for file access
        env: {
          ...process.env,
          PATH: enhancedPath,
        },
      });

      this.activeProcesses.set(file.path, childProcess);

      // Include command info in stdout for UI visibility
      let stdout = `=== Claude Code Conversion ===\nCommand: ${fullCommand}\nWorking Dir: ${workingDir}\nFile: ${file.path}\n${'='.repeat(50)}\n\n`;
      let stderr = '';

      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        this.activeProcesses.delete(file.path);
        const duration = Date.now() - startTime;

        if (code === 0) {
          logger.info(`Completed Claude Code conversion: ${file.path} (${duration}ms)`);
          resolve({
            filePath: file.path,
            success: true,
            outputPath: `${file.path}.md`,
            duration,
            stdout,
            stderr,
          });
        } else {
          const error = stderr || stdout || `Claude Code process exited with code ${code}`;
          logger.error(`Failed Claude Code conversion: ${file.path} - ${error}`);
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

      childProcess.on('error', (err) => {
        this.activeProcesses.delete(file.path);
        const duration = Date.now() - startTime;
        logger.error(`Claude Code process error for ${file.path}: ${err.message}`);
        resolve({
          filePath: file.path,
          success: false,
          error: `Claude Code not found or failed to start: ${err.message}. Ensure Claude Code is installed and ~/.local/bin is in PATH.`,
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
      useClaudeCode = false,
    } = options;

    // Filter out already converted files if requested
    const filesToConvert = skipConverted
      ? files.filter((f) => !f.hasMarkdown)
      : files;

    if (filesToConvert.length === 0) {
      logger.info('No files to convert');
      return [];
    }

    const conversionMethod = useClaudeCode ? 'Claude Code' : 'UMD';
    logger.info(
      `Starting batch conversion (${conversionMethod}): ${filesToConvert.length} files, concurrency: ${concurrency}`
    );

    // For Claude Code, find the common parent directory of all files
    // This ensures Claude Code has access to all files being converted
    let claudeCodeWorkingDir: string | undefined;
    if (useClaudeCode) {
      const filePaths = filesToConvert.map(f => f.path);
      claudeCodeWorkingDir = SkillsService.findCommonParent(filePaths);
      logger.info(`Claude Code working directory: ${claudeCodeWorkingDir}`);
    }

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

      // Use Claude Code or standard UMD conversion based on option
      const result = useClaudeCode
        ? await this.convertFileWithClaudeCode(file, claudeCodeWorkingDir!)
        : await this.convertFile(file);
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
