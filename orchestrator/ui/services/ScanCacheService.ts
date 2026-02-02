import * as fs from 'fs';
import * as path from 'path';
import { ScanResult } from '../../services/FileDiscoveryService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Cached scan result with metadata
 */
export interface CachedScan {
  /** Root path that was scanned */
  rootPath: string;
  /** The scan result */
  result: ScanResult;
  /** When the scan was performed */
  scannedAt: Date;
  /** Cache expiry time */
  expiresAt: Date;
}

/**
 * Service for caching scan results in memory and optionally on disk.
 * Reduces redundant file system operations for frequently accessed paths.
 */
export class ScanCacheService {
  private memoryCache: Map<string, CachedScan>;
  private cacheFilePath: string;
  private defaultTtlMs: number;

  constructor(dataLocation?: string, ttlMinutes: number = 5) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const configDir = dataLocation || path.join(homeDir, '.umd');
    this.cacheFilePath = path.join(configDir, 'scan-cache.json');
    this.memoryCache = new Map();
    this.defaultTtlMs = ttlMinutes * 60 * 1000;
    this.loadCache();
  }

  /**
   * Get cached scan result for a path
   */
  get(rootPath: string): CachedScan | null {
    const normalizedPath = path.normalize(rootPath);
    const cached = this.memoryCache.get(normalizedPath);

    if (!cached) {
      return null;
    }

    // Check if expired
    if (new Date() > cached.expiresAt) {
      this.memoryCache.delete(normalizedPath);
      this.saveCache();
      return null;
    }

    return cached;
  }

  /**
   * Store scan result in cache
   */
  set(rootPath: string, result: ScanResult, ttlMs?: number): void {
    const normalizedPath = path.normalize(rootPath);
    const now = new Date();
    const ttl = ttlMs ?? this.defaultTtlMs;

    const cached: CachedScan = {
      rootPath: normalizedPath,
      result,
      scannedAt: now,
      expiresAt: new Date(now.getTime() + ttl),
    };

    this.memoryCache.set(normalizedPath, cached);
    this.saveCache();
    logger.debug(`Cached scan result for: ${normalizedPath}`);
  }

  /**
   * Invalidate cache for a specific path
   */
  invalidate(rootPath: string): boolean {
    const normalizedPath = path.normalize(rootPath);
    const existed = this.memoryCache.delete(normalizedPath);
    if (existed) {
      this.saveCache();
      logger.debug(`Invalidated cache for: ${normalizedPath}`);
    }
    return existed;
  }

  /**
   * Invalidate all caches that include a specific file path
   */
  invalidateForFile(filePath: string): number {
    const normalizedFile = path.normalize(filePath);
    let invalidated = 0;

    for (const [rootPath] of this.memoryCache) {
      if (normalizedFile.startsWith(rootPath)) {
        this.memoryCache.delete(rootPath);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      this.saveCache();
      logger.debug(
        `Invalidated ${invalidated} cache(s) containing: ${normalizedFile}`
      );
    }

    return invalidated;
  }

  /**
   * Clear all cached scans
   */
  clearAll(): void {
    this.memoryCache.clear();
    this.saveCache();
    logger.info('Cleared all scan caches');
  }

  /**
   * Clear expired entries
   */
  cleanExpired(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [rootPath, cached] of this.memoryCache) {
      if (now > cached.expiresAt) {
        this.memoryCache.delete(rootPath);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.saveCache();
      logger.debug(`Cleaned ${cleaned} expired cache entries`);
    }

    return cleaned;
  }

  /**
   * Get all cached entries (for debugging/status)
   */
  getAllCached(): CachedScan[] {
    return Array.from(this.memoryCache.values());
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalEntries: number;
    expiredEntries: number;
    totalFiles: number;
  } {
    const now = new Date();
    let expiredEntries = 0;
    let totalFiles = 0;

    for (const cached of this.memoryCache.values()) {
      if (now > cached.expiresAt) {
        expiredEntries++;
      }
      totalFiles += cached.result.files.length;
    }

    return {
      totalEntries: this.memoryCache.size,
      expiredEntries,
      totalFiles,
    };
  }

  /**
   * Load cache from disk
   */
  private loadCache(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const data = fs.readFileSync(this.cacheFilePath, 'utf-8');
        const parsed = JSON.parse(data) as any[];
        const now = new Date();

        for (const entry of parsed) {
          const expiresAt = new Date(entry.expiresAt);

          // Only load non-expired entries
          if (expiresAt > now) {
            // Restore Date objects in scan result files
            const result: ScanResult = {
              ...entry.result,
              files: entry.result.files.map((f: any) => ({
                ...f,
                modifiedAt: new Date(f.modifiedAt),
              })),
              pending: entry.result.pending.map((f: any) => ({
                ...f,
                modifiedAt: new Date(f.modifiedAt),
              })),
              converted: entry.result.converted.map((f: any) => ({
                ...f,
                modifiedAt: new Date(f.modifiedAt),
              })),
            };

            this.memoryCache.set(entry.rootPath, {
              rootPath: entry.rootPath,
              result,
              scannedAt: new Date(entry.scannedAt),
              expiresAt,
            });
          }
        }

        if (this.memoryCache.size > 0) {
          logger.debug(`Loaded ${this.memoryCache.size} cached scan(s)`);
        }
      }
    } catch (error) {
      logger.error(
        `Failed to load scan cache: ${error instanceof Error ? error.message : String(error)}`
      );
      this.memoryCache = new Map();
    }
  }

  /**
   * Save cache to disk
   */
  private saveCache(): void {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const entries = Array.from(this.memoryCache.values());
      fs.writeFileSync(
        this.cacheFilePath,
        JSON.stringify(entries, null, 2),
        'utf-8'
      );
    } catch (error) {
      logger.error(
        `Failed to save scan cache: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
