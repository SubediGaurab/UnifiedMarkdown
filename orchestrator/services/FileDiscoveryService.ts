import * as fs from 'fs';
import * as path from 'path';
import {
  ALL_SUPPORTED_EXTENSIONS,
  isSupportedExtension,
} from '../../core/constants/fileTypes.js';
import { logger } from '../../core/utils/logger.js';

/**
 * Represents a discovered file with its conversion status
 */
export interface DiscoveredFile {
  /** Absolute path to the file */
  path: string;
  /** File extension (without dot) */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modifiedAt: Date;
  /** Whether a corresponding .md file exists */
  hasMarkdown: boolean;
  /** Path to the markdown file (if exists) */
  markdownPath: string;
}

/**
 * Result of a directory scan
 */
export interface ScanResult {
  /** All discovered convertible files */
  files: DiscoveredFile[];
  /** Files that have not been converted yet */
  pending: DiscoveredFile[];
  /** Files that already have markdown */
  converted: DiscoveredFile[];
  /** Total files scanned */
  totalScanned: number;
  /** Directories scanned */
  directoriesScanned: number;
  /** Errors encountered during scan */
  errors: string[];
}

/**
 * Options for file discovery
 */
export interface ScanOptions {
  /** Whether to scan recursively (default: true) */
  recursive?: boolean;
  /** File extensions to include (default: all supported) */
  extensions?: string[];
  /** Maximum depth for recursive scan (default: unlimited) */
  maxDepth?: number;
  /** Directories to exclude (e.g., node_modules, .git) */
  excludeDirs?: string[];
}

const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  '.svn',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
  '$RECYCLE.BIN',
  '$Recycle.Bin',
  'System Volume Information',
];

/**
 * Service for discovering files that can be converted to markdown
 */
export class FileDiscoveryService {
  private options: Required<ScanOptions>;

  constructor(options: ScanOptions = {}) {
    this.options = {
      recursive: options.recursive ?? true,
      extensions: options.extensions ?? [...ALL_SUPPORTED_EXTENSIONS],
      maxDepth: options.maxDepth ?? Infinity,
      excludeDirs: options.excludeDirs ?? DEFAULT_EXCLUDE_DIRS,
    };
  }

  /**
   * Scan a directory for convertible files
   */
  async scan(rootPath: string): Promise<ScanResult> {
    const absolutePath = path.resolve(rootPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Path does not exist: ${absolutePath}`);
    }

    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${absolutePath}`);
    }

    logger.info(`Scanning directory: ${absolutePath}`);

    const result: ScanResult = {
      files: [],
      pending: [],
      converted: [],
      totalScanned: 0,
      directoriesScanned: 0,
      errors: [],
    };

    await this.scanDirectory(absolutePath, 0, result);

    // Categorize files
    for (const file of result.files) {
      if (file.hasMarkdown) {
        result.converted.push(file);
      } else {
        result.pending.push(file);
      }
    }

    logger.info(
      `Scan complete: ${result.files.length} files found, ${result.pending.length} pending conversion`
    );

    return result;
  }

  /**
   * Recursively scan a directory
   */
  private async scanDirectory(
    dirPath: string,
    depth: number,
    result: ScanResult
  ): Promise<void> {
    if (depth > this.options.maxDepth) {
      return;
    }

    result.directoriesScanned++;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (error) {
      const message = `Failed to read directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(message);
      logger.error(message);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      try {
        if (entry.isDirectory()) {
          // Skip excluded directories
          if (this.options.excludeDirs.includes(entry.name)) {
            continue;
          }

          if (this.options.recursive) {
            await this.scanDirectory(fullPath, depth + 1, result);
          }
        } else if (entry.isFile()) {
          result.totalScanned++;
          const discovered = this.processFile(fullPath);
          if (discovered) {
            result.files.push(discovered);
          }
        }
      } catch (error) {
        const message = `Error processing ${fullPath}: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(message);
        logger.error(message);
      }
    }
  }

  /**
   * Process a single file and return DiscoveredFile if it's convertible
   */
  private processFile(filePath: string): DiscoveredFile | null {
    const fileName = path.basename(filePath);
    
    // Skip temporary Office files (start with ~$)
    if (fileName.startsWith('~$')) {
      return null;
    }

    const ext = path.extname(filePath).toLowerCase().slice(1);

    // Check if it's a supported extension
    if (!this.options.extensions.includes(ext)) {
      return null;
    }

    if (!isSupportedExtension(ext)) {
      return null;
    }

    // Skip if this is already a markdown file
    if (ext === 'md') {
      return null;
    }

    const stats = fs.statSync(filePath);
    const markdownPath = `${filePath}.md`;
    const hasMarkdown = fs.existsSync(markdownPath);

    return {
      path: filePath,
      extension: ext,
      size: stats.size,
      modifiedAt: stats.mtime,
      hasMarkdown,
      markdownPath,
    };
  }

  /**
   * Check if a specific file has been converted
   */
  isConverted(filePath: string): boolean {
    const markdownPath = `${filePath}.md`;
    return fs.existsSync(markdownPath);
  }
}
