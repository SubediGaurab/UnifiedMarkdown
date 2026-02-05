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
  /** Excluded files/directories */
  excluded: ExcludedItem[];
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
  /** Optional exclusion matcher for custom rules */
  exclusionMatcher?: ExclusionMatcher;
}

export const DEFAULT_EXCLUDE_DIRS = [
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

const FOUND_DIR_PATTERN = /^found\.\d+$/i;

export type DefaultExclusionRule = {
  type: 'directory' | 'pattern';
  pattern: string;
  description?: string;
};

export type ExclusionRuleInfo = {
  source: 'default' | 'custom';
  type: 'file' | 'directory' | 'pattern';
  pattern: string;
  scope?: string;
  id?: string;
};

export type ExclusionMatch = {
  rule: ExclusionRuleInfo;
  reason: string;
};

export type ExcludedItem = ExclusionMatch & {
  path: string;
  type: 'file' | 'directory';
};

export type ExclusionMatcher = (
  filePath: string,
  type: 'file' | 'directory'
) => ExclusionMatch | null;

const DEFAULT_EXCLUSION_RULES: DefaultExclusionRule[] = [
  ...DEFAULT_EXCLUDE_DIRS.map(
    (pattern): DefaultExclusionRule => ({ type: 'directory', pattern })
  ),
  {
    type: 'pattern',
    pattern: 'found.*',
    description: 'Windows recovered files directories (found.000, found.001, ...)',
  },
];

export function getDefaultExclusionRules(): DefaultExclusionRule[] {
  return DEFAULT_EXCLUSION_RULES.map((rule) => ({ ...rule }));
}

/**
 * Service for discovering files that can be converted to markdown
 */
export class FileDiscoveryService {
  private options: Required<Omit<ScanOptions, 'exclusionMatcher'>> & {
    exclusionMatcher?: ExclusionMatcher;
  };

  constructor(options: ScanOptions = {}) {
    this.options = {
      recursive: options.recursive ?? true,
      extensions: options.extensions ?? [...ALL_SUPPORTED_EXTENSIONS],
      maxDepth: options.maxDepth ?? Infinity,
      excludeDirs: options.excludeDirs ?? DEFAULT_EXCLUDE_DIRS,
      exclusionMatcher: options.exclusionMatcher,
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
      excluded: [],
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
          const exclusionMatch = this.getDirectoryExclusionMatch(
            entry.name,
            fullPath
          );
          if (exclusionMatch) {
            result.excluded.push({
              path: fullPath,
              type: 'directory',
              ...exclusionMatch,
            });
            continue;
          }

          if (this.options.recursive) {
            await this.scanDirectory(fullPath, depth + 1, result);
          }
        } else if (entry.isFile()) {
          result.totalScanned++;
          const discovered = this.processFile(fullPath);
          if (!discovered) {
            continue;
          }

          const exclusionMatch = this.getFileExclusionMatch(fullPath);
          if (exclusionMatch) {
            result.excluded.push({
              path: fullPath,
              type: 'file',
              ...exclusionMatch,
            });
            continue;
          }

          result.files.push(discovered);
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
   * Check if a directory name should be excluded from scanning
   */
  private getDirectoryExclusionMatch(
    dirName: string,
    fullPath: string
  ): ExclusionMatch | null {
    const customMatch = this.options.exclusionMatcher?.(
      fullPath,
      'directory'
    );
    if (customMatch) {
      return customMatch;
    }

    if (FOUND_DIR_PATTERN.test(dirName)) {
      return {
        rule: {
          source: 'default',
          type: 'pattern',
          pattern: 'found.*',
        },
        reason:
          'Built-in exclusion for Windows recovered files directories (found.000, found.001, ...)',
      };
    }

    const lowerName = dirName.toLowerCase();
    const matched = this.options.excludeDirs.find(
      (excluded) => excluded.toLowerCase() === lowerName
    );

    if (matched) {
      return {
        rule: {
          source: 'default',
          type: 'directory',
          pattern: matched,
        },
        reason: `Built-in exclusion for "${matched}" directories`,
      };
    }

    return null;
  }

  private getFileExclusionMatch(filePath: string): ExclusionMatch | null {
    return this.options.exclusionMatcher?.(filePath, 'file') ?? null;
  }

  /**
   * Check if a specific file has been converted
   */
  isConverted(filePath: string): boolean {
    const markdownPath = `${filePath}.md`;
    return fs.existsSync(markdownPath);
  }
}
