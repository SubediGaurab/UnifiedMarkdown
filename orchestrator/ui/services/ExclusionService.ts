import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ExclusionRule } from '../../../core/interfaces/IConfig.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Service for managing file/directory exclusion rules.
 * Exclusions are persisted to ~/.umd/exclusions.json
 */
export class ExclusionService {
  private exclusionsFilePath: string;
  private rules: Map<string, ExclusionRule>;

  constructor(dataLocation?: string) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const configDir = dataLocation || path.join(homeDir, '.umd');
    this.exclusionsFilePath = path.join(configDir, 'exclusions.json');
    this.rules = new Map();
    this.loadRules();
  }

  /**
   * Get all exclusion rules
   */
  getAllRules(): ExclusionRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rules for a specific scope (global or path-specific)
   */
  getRulesForScope(scope: 'global' | string): ExclusionRule[] {
    return this.getAllRules().filter(
      (rule) => rule.scope === 'global' || rule.scope === scope
    );
  }

  /**
   * Get a single rule by ID
   */
  getRule(id: string): ExclusionRule | undefined {
    return this.rules.get(id);
  }

  /**
   * Add a new exclusion rule
   */
  addRule(
    pattern: string,
    type: 'file' | 'directory' | 'pattern',
    scope: 'global' | string = 'global'
  ): ExclusionRule {
    const rule: ExclusionRule = {
      id: randomUUID(),
      pattern,
      type,
      scope,
      createdAt: new Date().toISOString(),
    };

    this.rules.set(rule.id, rule);
    this.saveRules();
    logger.info(`Added exclusion rule: ${type} "${pattern}" (scope: ${scope})`);
    return rule;
  }

  /**
   * Remove an exclusion rule
   */
  removeRule(id: string): boolean {
    const rule = this.rules.get(id);
    if (rule) {
      this.rules.delete(id);
      this.saveRules();
      logger.info(`Removed exclusion rule: ${rule.type} "${rule.pattern}"`);
      return true;
    }
    return false;
  }

  /**
   * Update an existing rule
   */
  updateRule(
    id: string,
    updates: Partial<Omit<ExclusionRule, 'id' | 'createdAt'>>
  ): ExclusionRule | null {
    const rule = this.rules.get(id);
    if (!rule) {
      return null;
    }

    const updatedRule: ExclusionRule = {
      ...rule,
      ...updates,
    };

    this.rules.set(id, updatedRule);
    this.saveRules();
    return updatedRule;
  }

  /**
   * Check if a file path should be excluded
   */
  isExcluded(filePath: string, rootPath?: string): boolean {
    return this.getMatchingRule(filePath, rootPath) !== null;
  }

  /**
   * Get the first matching exclusion rule (if any)
   */
  getMatchingRule(filePath: string, rootPath?: string): ExclusionRule | null {
    // Normalize to forward slashes for consistent matching
    const normalizedPath = filePath.replace(/\\/g, '/');
    const rules = rootPath
      ? this.getRulesForScope(rootPath)
      : this.getAllRules();

    for (const rule of rules) {
      if (this.matchesRule(normalizedPath, rule)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Check if a path matches a specific rule
   */
  private matchesRule(filePath: string, rule: ExclusionRule): boolean {
    // Normalize pattern to forward slashes for consistent matching
    const normalizedPattern = rule.pattern.replace(/\\/g, '/');

    switch (rule.type) {
      case 'file':
        // Exact file match (case-insensitive on Windows)
        return filePath.toLowerCase() === normalizedPattern.toLowerCase();

      case 'directory':
        // Check if the file is under the excluded directory
        const lowerPath = filePath.toLowerCase();
        const lowerPattern = normalizedPattern.toLowerCase();
        return (
          lowerPath.startsWith(lowerPattern + '/') ||
          lowerPath === lowerPattern
        );

      case 'pattern':
        // Glob-like pattern matching
        return this.matchGlobPattern(filePath, rule.pattern);

      default:
        return false;
    }
  }

  /**
   * Simple glob pattern matching
   * Supports: * (match any chars in segment), ** (match any path), ? (match single char)
   */
  private matchGlobPattern(filePath: string, pattern: string): boolean {
    // Normalize both paths to forward slashes
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Convert glob pattern to regex
    // First, escape all regex special chars
    let regexPattern = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

    // Replace **/ with a placeholder (to avoid conflict with single *)
    regexPattern = regexPattern.replace(/\*\*\//g, '<<<GLOBSTAR>>>');
    // Replace ** at end of pattern
    regexPattern = regexPattern.replace(/\*\*$/g, '<<<GLOBSTAR_END>>>');
    // Replace remaining ** (shouldn't happen but just in case)
    regexPattern = regexPattern.replace(/\*\*/g, '<<<GLOBSTAR_END>>>');

    // Convert * to match within segment (not path separator)
    regexPattern = regexPattern.replace(/\*/g, '[^/]*');

    // Convert ? to match single char (not path separator)
    regexPattern = regexPattern.replace(/\?/g, '[^/]');

    // Restore globstar patterns
    regexPattern = regexPattern.replace(/<<<GLOBSTAR>>>/g, '(?:.*/)?');
    regexPattern = regexPattern.replace(/<<<GLOBSTAR_END>>>/g, '.*');

    // Anchor pattern
    regexPattern = `^${regexPattern}$`;

    try {
      const regex = new RegExp(regexPattern, 'i');
      return regex.test(normalizedPath);
    } catch {
      logger.error(`Invalid glob pattern: ${pattern}`);
      return false;
    }
  }

  /**
   * Filter out excluded files from a list
   */
  filterExcluded(filePaths: string[], rootPath?: string): string[] {
    return filePaths.filter((filePath) => !this.isExcluded(filePath, rootPath));
  }

  /**
   * Clear all exclusion rules
   */
  clearAll(): void {
    this.rules.clear();
    this.saveRules();
    logger.info('Cleared all exclusion rules');
  }

  /**
   * Import rules from JSON
   */
  importRules(rules: ExclusionRule[]): number {
    let imported = 0;
    for (const rule of rules) {
      if (rule.id && rule.pattern && rule.type) {
        this.rules.set(rule.id, {
          ...rule,
          createdAt: rule.createdAt || new Date().toISOString(),
        });
        imported++;
      }
    }
    this.saveRules();
    return imported;
  }

  /**
   * Export rules to JSON-serializable format
   */
  exportRules(): ExclusionRule[] {
    return this.getAllRules();
  }

  /**
   * Load rules from disk
   */
  private loadRules(): void {
    try {
      if (fs.existsSync(this.exclusionsFilePath)) {
        const data = fs.readFileSync(this.exclusionsFilePath, 'utf-8');
        const parsed = JSON.parse(data) as ExclusionRule[];

        for (const rule of parsed) {
          if (rule.id) {
            this.rules.set(rule.id, rule);
          }
        }

        logger.info(`Loaded ${this.rules.size} exclusion rule(s)`);
      }
    } catch (error) {
      logger.error(
        `Failed to load exclusion rules: ${error instanceof Error ? error.message : String(error)}`
      );
      this.rules = new Map();
    }
  }

  /**
   * Save rules to disk
   */
  private saveRules(): void {
    try {
      const dir = path.dirname(this.exclusionsFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const rules = this.getAllRules();
      fs.writeFileSync(
        this.exclusionsFilePath,
        JSON.stringify(rules, null, 2),
        'utf-8'
      );
    } catch (error) {
      logger.error(
        `Failed to save exclusion rules: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
