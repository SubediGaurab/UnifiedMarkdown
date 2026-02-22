import { Router, Request, Response } from 'express';
import * as path from 'path';
import { RouteContext } from '../UIServerService.js';
import { FileDiscoveryService, ScanOptions } from '../../../services/FileDiscoveryService.js';
import { logger } from '../../../../core/utils/logger.js';
import { normalizeInputPath } from '../../../utils/pathInput.js';

/**
 * Request body for POST /api/scan
 */
interface ScanRequest {
  rootPath: string;
  recursive?: boolean;
  maxDepth?: number;
  extensions?: string[];
  excludeDirs?: string[];
}

/**
 * Create scan routes
 */
export function createScanRoutes(context: RouteContext): Router {
  const router = Router();

  /**
   * POST /api/scan
   * Trigger a new scan of a directory
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const body = req.body as ScanRequest;

      if (!body.rootPath) {
        return res.status(400).json({ error: 'rootPath is required' });
      }
      const normalizedRootPath = normalizeInputPath(body.rootPath);
      if (!normalizedRootPath) {
        return res.status(400).json({ error: 'rootPath is required' });
      }

      const rootPath = path.resolve(normalizedRootPath);
      // Always perform a fresh scan (cache is only used for status/history)

      // Emit scan start event
      context.eventEmitter.emit('server-event', {
        type: 'scan-start',
        data: { rootPath },
        timestamp: new Date(),
      });

      // Build scan options
      const options: ScanOptions = {
        recursive: body.recursive ?? true,
        maxDepth: body.maxDepth,
        extensions: body.extensions,
        excludeDirs: body.excludeDirs,
        exclusionMatcher: (filePath, _type) => {
          const matchedRule = context.exclusionService.getMatchingRule(
            filePath,
            rootPath
          );
          if (!matchedRule) {
            return null;
          }

          const scopeSuffix =
            matchedRule.scope && matchedRule.scope !== 'global'
              ? ` (scope: ${matchedRule.scope})`
              : '';

          return {
            rule: {
              source: 'custom',
              type: matchedRule.type,
              pattern: matchedRule.pattern,
              scope: matchedRule.scope,
              id: matchedRule.id,
            },
            reason: `Matched custom ${matchedRule.type} rule: ${matchedRule.pattern}${scopeSuffix}`,
          };
        },
      };

      // Create a new FileDiscoveryService with the options
      const discoveryService = new FileDiscoveryService(options);

      // Perform the scan
      const result = await discoveryService.scan(rootPath);

      // Apply exclusion filtering
      const exclusionRules = context.exclusionService.getRulesForScope(rootPath);
      const filteredFiles = result.files.filter(
        (file) => !context.exclusionService.isExcluded(file.path, rootPath)
      );
      const filteredPending = result.pending.filter(
        (file) => !context.exclusionService.isExcluded(file.path, rootPath)
      );
      const filteredConverted = result.converted.filter(
        (file) => !context.exclusionService.isExcluded(file.path, rootPath)
      );

      const filteredResult = {
        ...result,
        files: filteredFiles,
        pending: filteredPending,
        converted: filteredConverted,
        exclusionsApplied: exclusionRules.length,
      };

      // Cache the result
      context.scanCache.set(rootPath, filteredResult);

      // Emit scan complete event
      context.eventEmitter.emit('server-event', {
        type: 'scan-complete',
        data: {
          rootPath,
          totalFiles: filteredResult.files.length,
          pendingFiles: filteredResult.pending.length,
          convertedFiles: filteredResult.converted.length,
        },
        timestamp: new Date(),
      });

      return res.json({
        ...filteredResult,
        fromCache: false,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(`Scan failed: ${message}`);

      context.eventEmitter.emit('server-event', {
        type: 'error',
        data: { error: message, operation: 'scan' },
        timestamp: new Date(),
      });

      return res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/scan/result
   * Get the latest cached scan result (if any)
   */
  router.get('/result', (req: Request, res: Response) => {
    const rootPath = req.query.rootPath as string;

    if (rootPath) {
      const cached = context.scanCache.get(path.resolve(rootPath));
      if (cached) {
        return res.json({
          ...cached.result,
          fromCache: true,
          cachedAt: cached.scannedAt.toISOString(),
          expiresAt: cached.expiresAt.toISOString(),
        });
      }
      return res.status(404).json({ error: 'No cached scan for this path' });
    }

    // Return all cached results
    const allCached = context.scanCache.getAllCached();
    return res.json({
      caches: allCached.map((c) => ({
        rootPath: c.rootPath,
        fileCount: c.result.files.length,
        pendingCount: c.result.pending.length,
        convertedCount: c.result.converted.length,
        scannedAt: c.scannedAt.toISOString(),
        expiresAt: c.expiresAt.toISOString(),
      })),
      stats: context.scanCache.getStats(),
    });
  });

  /**
   * DELETE /api/scan/cache
   * Invalidate scan cache
   */
  router.delete('/cache', (req: Request, res: Response) => {
    const rootPath = req.query.rootPath as string;

    if (rootPath) {
      const invalidated = context.scanCache.invalidate(path.resolve(rootPath));
      return res.json({
        success: invalidated,
        message: invalidated
          ? 'Cache invalidated'
          : 'No cache found for this path',
      });
    }

    context.scanCache.clearAll();
    return res.json({ success: true, message: 'All caches cleared' });
  });

  return router;
}
