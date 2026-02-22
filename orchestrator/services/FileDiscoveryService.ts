import * as fs from 'fs';
import * as path from 'path';
import {
  ALL_SUPPORTED_EXTENSIONS,
  isSupportedExtension,
} from '../../core/constants/fileTypes.js';
import { logger } from '../../core/utils/logger.js';
import { normalizeInputPath } from '../utils/pathInput.js';

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
const UMD_IGNORE_FILENAME = '.umdignore';

export type DefaultExclusionRule = {
  type: 'directory' | 'pattern';
  pattern: string;
  description?: string;
};

export type ExclusionRuleInfo = {
  source: 'default' | 'custom' | 'umdignore';
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

type UmdIgnoreRule = {
  baseDir: string;
  sourceFile: string;
  sourceLine: number;
  pattern: string;
  displayPattern: string;
  hasSlash: boolean;
  directoryOnly: boolean;
  negated: boolean;
  anchored: boolean;
};

const DEFAULT_EXCLUSION_RULES: DefaultExclusionRule[] = [
  ...DEFAULT_EXCLUDE_DIRS.map(
    (pattern): DefaultExclusionRule => ({ type: 'directory', pattern })
  ),
  {
    type: 'pattern',
    pattern: 'found.*',
    description:
      'Windows recovered files directories (found.000, found.001, ...)',
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
    const absolutePath = path.resolve(normalizeInputPath(rootPath));

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

    await this.scanDirectory(absolutePath, 0, result, []);

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
    result: ScanResult,
    activeIgnoreRules: UmdIgnoreRule[]
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

    const localIgnoreRules = this.loadUmdIgnoreRules(dirPath, result);
    const mergedIgnoreRules = [...activeIgnoreRules, ...localIgnoreRules];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      try {
        if (entry.isDirectory()) {
          const exclusionMatch = this.getDirectoryExclusionMatch(
            entry.name,
            fullPath,
            mergedIgnoreRules
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
            await this.scanDirectory(
              fullPath,
              depth + 1,
              result,
              mergedIgnoreRules
            );
          }
        } else if (entry.isFile()) {
          if (entry.name === UMD_IGNORE_FILENAME) {
            result.excluded.push({
              path: fullPath,
              type: 'file',
              rule: {
                source: 'default',
                type: 'file',
                pattern: UMD_IGNORE_FILENAME,
              },
              reason: `Built-in exclusion for "${UMD_IGNORE_FILENAME}" control files`,
            });
            continue;
          }

          result.totalScanned++;
          const discovered = this.processFile(fullPath);
          if (!discovered) {
            continue;
          }

          const exclusionMatch = this.getFileExclusionMatch(
            fullPath,
            mergedIgnoreRules
          );
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
    fullPath: string,
    activeIgnoreRules: UmdIgnoreRule[]
  ): ExclusionMatch | null {
    const customMatch = this.options.exclusionMatcher?.(fullPath, 'directory');
    if (customMatch) {
      return customMatch;
    }

    const umdIgnoreMatch = this.getUmdIgnoreExclusionMatch(
      fullPath,
      'directory',
      activeIgnoreRules
    );
    if (umdIgnoreMatch) {
      return umdIgnoreMatch;
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

  private getFileExclusionMatch(
    filePath: string,
    activeIgnoreRules: UmdIgnoreRule[]
  ): ExclusionMatch | null {
    const customMatch = this.options.exclusionMatcher?.(filePath, 'file');
    if (customMatch) {
      return customMatch;
    }

    return this.getUmdIgnoreExclusionMatch(filePath, 'file', activeIgnoreRules);
  }

  private loadUmdIgnoreRules(
    dirPath: string,
    result: ScanResult
  ): UmdIgnoreRule[] {
    const ignorePath = path.join(dirPath, UMD_IGNORE_FILENAME);
    if (!fs.existsSync(ignorePath)) {
      return [];
    }

    let content: string;
    try {
      content = fs.readFileSync(ignorePath, 'utf-8');
    } catch (error) {
      const message = `Failed to read ${ignorePath}: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(message);
      logger.error(message);
      return [];
    }

    const rules: UmdIgnoreRule[] = [];
    const lines = content.split(/\r?\n/u);

    for (let index = 0; index < lines.length; index++) {
      const parsedRule = this.parseUmdIgnoreRule(
        lines[index],
        dirPath,
        ignorePath,
        index + 1
      );
      if (parsedRule) {
        rules.push(parsedRule);
      }
    }

    return rules;
  }

  private parseUmdIgnoreRule(
    line: string,
    baseDir: string,
    sourceFile: string,
    sourceLine: number
  ): UmdIgnoreRule | null {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return null;
    }

    let ruleBody = trimmedLine.replace(/\s+#.*$/u, '').trim();
    if (!ruleBody) {
      return null;
    }

    let negated = false;
    if (ruleBody.startsWith('\\#') || ruleBody.startsWith('\\!')) {
      ruleBody = ruleBody.slice(1);
    } else if (ruleBody.startsWith('!')) {
      negated = true;
      ruleBody = ruleBody.slice(1).trim();
    }

    if (!ruleBody) {
      return null;
    }

    let directoryOnly = false;
    if (ruleBody.endsWith('/')) {
      directoryOnly = true;
      ruleBody = ruleBody.slice(0, -1);
    }

    let anchored = false;
    if (ruleBody.startsWith('/')) {
      anchored = true;
      ruleBody = ruleBody.slice(1);
    }

    if (!ruleBody) {
      return null;
    }

    return {
      baseDir,
      sourceFile,
      sourceLine,
      pattern: ruleBody,
      displayPattern: `${negated ? '!' : ''}${anchored ? '/' : ''}${ruleBody}${directoryOnly ? '/' : ''}`,
      hasSlash: ruleBody.includes('/'),
      directoryOnly,
      negated,
      anchored,
    };
  }

  private getUmdIgnoreExclusionMatch(
    targetPath: string,
    targetType: 'file' | 'directory',
    activeIgnoreRules: UmdIgnoreRule[]
  ): ExclusionMatch | null {
    let lastMatchedRule: UmdIgnoreRule | null = null;
    let isIgnored = false;

    for (const rule of activeIgnoreRules) {
      if (!this.matchesUmdIgnoreRule(targetPath, targetType, rule)) {
        continue;
      }

      lastMatchedRule = rule;
      isIgnored = !rule.negated;
    }

    if (!lastMatchedRule || !isIgnored) {
      return null;
    }

    return {
      rule: {
        source: 'umdignore',
        type: lastMatchedRule.directoryOnly ? 'directory' : 'pattern',
        pattern: lastMatchedRule.displayPattern,
        scope: lastMatchedRule.sourceFile,
      },
      reason: `Matched ${UMD_IGNORE_FILENAME} rule "${lastMatchedRule.displayPattern}" in ${lastMatchedRule.sourceFile}:${lastMatchedRule.sourceLine}`,
    };
  }

  private matchesUmdIgnoreRule(
    targetPath: string,
    targetType: 'file' | 'directory',
    rule: UmdIgnoreRule
  ): boolean {
    if (rule.directoryOnly && targetType !== 'directory') {
      return false;
    }

    const relativePath = this.relativePathWithinBase(targetPath, rule.baseDir);
    if (!relativePath) {
      return false;
    }

    if (rule.anchored) {
      return this.matchesUmdIgnorePattern(relativePath, rule.pattern);
    }

    if (!rule.hasSlash) {
      const baseName = path.posix.basename(relativePath);
      return this.matchesUmdIgnorePattern(baseName, rule.pattern);
    }

    return this.matchesUmdIgnorePattern(relativePath, rule.pattern);
  }

  private relativePathWithinBase(
    targetPath: string,
    baseDir: string
  ): string | null {
    const relative = path.relative(baseDir, targetPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }

    return relative.replace(/\\/gu, '/');
  }

  private matchesUmdIgnorePattern(value: string, pattern: string): boolean {
    const globSentinel = '<<<GLOBSTAR>>>';
    let regexPattern = '';

    for (const char of pattern) {
      if (char === '*' || char === '?') {
        regexPattern += char;
        continue;
      }

      if (/[|\\{}()[\]^$+?.]/u.test(char)) {
        regexPattern += `\\${char}`;
      } else {
        regexPattern += char;
      }
    }

    regexPattern = regexPattern.replace(/\*\*/gu, globSentinel);
    regexPattern = regexPattern.replace(/\*/gu, '[^/]*');
    regexPattern = regexPattern.replace(/\?/gu, '[^/]');
    regexPattern = regexPattern.replace(new RegExp(globSentinel, 'gu'), '.*');

    try {
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(value);
    } catch {
      return false;
    }
  }

  /**
   * Check if a specific file has been converted
   */
  isConverted(filePath: string): boolean {
    const markdownPath = `${filePath}.md`;
    return fs.existsSync(markdownPath);
  }
}
