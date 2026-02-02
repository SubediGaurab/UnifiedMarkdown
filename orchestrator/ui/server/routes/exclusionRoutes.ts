import { Router, Request, Response } from 'express';
import { RouteContext } from '../UIServerService.js';
import { ExclusionRule } from '../../../../core/interfaces/IConfig.js';
import { logger } from '../../../../core/utils/logger.js';

/**
 * Request body for POST /api/exclusions
 */
interface AddExclusionRequest {
  pattern: string;
  type: 'file' | 'directory' | 'pattern';
  scope?: 'global' | string;
}

/**
 * Request body for PUT /api/exclusions/:id
 */
interface UpdateExclusionRequest {
  pattern?: string;
  type?: 'file' | 'directory' | 'pattern';
  scope?: 'global' | string;
}

/**
 * Request body for POST /api/exclusions/import
 */
interface ImportExclusionsRequest {
  rules: ExclusionRule[];
}

/**
 * Create exclusion routes
 */
export function createExclusionRoutes(context: RouteContext): Router {
  const router = Router();

  /**
   * GET /api/exclusions
   * Get all exclusion rules
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const scope = req.query.scope as string | undefined;

      let rules: ExclusionRule[];
      if (scope) {
        rules = context.exclusionService.getRulesForScope(scope);
      } else {
        rules = context.exclusionService.getAllRules();
      }

      return res.json({
        rules,
        total: rules.length,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(`Failed to get exclusions: ${message}`);
      return res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/exclusions/:id
   * Get a single exclusion rule by ID
   */
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const rule = context.exclusionService.getRule(id);

      if (!rule) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      return res.json(rule);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/exclusions
   * Add a new exclusion rule
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const body = req.body as AddExclusionRequest;

      if (!body.pattern) {
        return res.status(400).json({ error: 'pattern is required' });
      }

      if (!body.type || !['file', 'directory', 'pattern'].includes(body.type)) {
        return res.status(400).json({
          error: 'type is required and must be one of: file, directory, pattern',
        });
      }

      const rule = context.exclusionService.addRule(
        body.pattern,
        body.type,
        body.scope || 'global'
      );

      // Invalidate any cached scans that might be affected
      if (body.scope && body.scope !== 'global') {
        context.scanCache.invalidate(body.scope);
      } else {
        context.scanCache.clearAll();
      }

      return res.status(201).json(rule);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(`Failed to add exclusion: ${message}`);
      return res.status(500).json({ error: message });
    }
  });

  /**
   * PUT /api/exclusions/:id
   * Update an existing exclusion rule
   */
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateExclusionRequest;

      if (body.type && !['file', 'directory', 'pattern'].includes(body.type)) {
        return res.status(400).json({
          error: 'type must be one of: file, directory, pattern',
        });
      }

      const updatedRule = context.exclusionService.updateRule(id, body);

      if (!updatedRule) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      // Invalidate caches
      context.scanCache.clearAll();

      return res.json(updatedRule);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  /**
   * DELETE /api/exclusions/:id
   * Remove an exclusion rule (restore the item to scans)
   */
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const removed = context.exclusionService.removeRule(id);

      if (!removed) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      // Invalidate caches since items will now be included
      context.scanCache.clearAll();

      return res.json({
        success: true,
        message: 'Exclusion rule removed. Item will appear in future scans.',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/exclusions/check
   * Check if a path is excluded
   */
  router.post('/check', (req: Request, res: Response) => {
    try {
      const { path: filePath, rootPath } = req.body as {
        path: string;
        rootPath?: string;
      };

      if (!filePath) {
        return res.status(400).json({ error: 'path is required' });
      }

      const isExcluded = context.exclusionService.isExcluded(filePath, rootPath);

      return res.json({
        path: filePath,
        isExcluded,
        rootPath: rootPath || 'global',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/exclusions/import
   * Import exclusion rules from JSON
   */
  router.post('/import', (req: Request, res: Response) => {
    try {
      const body = req.body as ImportExclusionsRequest;

      if (!body.rules || !Array.isArray(body.rules)) {
        return res.status(400).json({ error: 'rules array is required' });
      }

      const imported = context.exclusionService.importRules(body.rules);
      context.scanCache.clearAll();

      return res.json({
        success: true,
        imported,
        total: context.exclusionService.getAllRules().length,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/exclusions/export
   * Export all exclusion rules as JSON
   */
  router.get('/export', (_req: Request, res: Response) => {
    try {
      const rules = context.exclusionService.exportRules();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="exclusions.json"'
      );
      return res.json(rules);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  /**
   * DELETE /api/exclusions
   * Clear all exclusion rules
   */
  router.delete('/', (req: Request, res: Response) => {
    try {
      const confirm = req.query.confirm === 'true';

      if (!confirm) {
        return res.status(400).json({
          error: 'Add ?confirm=true to confirm clearing all exclusion rules',
        });
      }

      context.exclusionService.clearAll();
      context.scanCache.clearAll();

      return res.json({
        success: true,
        message: 'All exclusion rules cleared',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
