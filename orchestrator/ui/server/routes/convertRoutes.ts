import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { RouteContext } from '../UIServerService.js';
import { DiscoveredFile } from '../../../services/FileDiscoveryService.js';
import { logger } from '../../../../core/utils/logger.js';

/**
 * Request body for POST /api/convert
 */
interface ConvertRequest {
  files: string[];
  concurrency?: number;
  skipConverted?: boolean;
}

/**
 * Create convert routes
 */
export function createConvertRoutes(context: RouteContext): Router {
  const router = Router();

  /**
   * POST /api/convert
   * Start a batch conversion with a list of file paths
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const body = req.body as ConvertRequest;

      if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
        return res.status(400).json({
          error: 'files is required and must be a non-empty array of file paths',
        });
      }

      // Validate and build DiscoveredFile objects
      const discoveredFiles: DiscoveredFile[] = [];
      const errors: string[] = [];

      for (const filePath of body.files) {
        const resolvedPath = path.resolve(filePath);

        // Check if file exists
        if (!fs.existsSync(resolvedPath)) {
          errors.push(`File not found: ${filePath}`);
          continue;
        }

        // Check if excluded
        if (context.exclusionService.isExcluded(resolvedPath)) {
          errors.push(`File is excluded: ${filePath}`);
          continue;
        }

        // Get file stats
        const stats = fs.statSync(resolvedPath);
        if (!stats.isFile()) {
          errors.push(`Not a file: ${filePath}`);
          continue;
        }

        const ext = path.extname(resolvedPath).toLowerCase().slice(1);
        const markdownPath = `${resolvedPath}.md`;
        const hasMarkdown = fs.existsSync(markdownPath);

        discoveredFiles.push({
          path: resolvedPath,
          extension: ext,
          size: stats.size,
          modifiedAt: stats.mtime,
          hasMarkdown,
          markdownPath,
        });
      }

      if (discoveredFiles.length === 0) {
        return res.status(400).json({
          error: 'No valid files to convert',
          validationErrors: errors,
        });
      }

      // Generate job ID
      const jobId = `job-${randomUUID().slice(0, 8)}`;

      // Create batch in state service
      const rootPath = path.dirname(discoveredFiles[0].path);
      context.conversionState.createBatch(jobId, rootPath);

      // Emit conversion start event
      context.eventEmitter.emit('server-event', {
        type: 'conversion-start',
        data: {
          jobId,
          totalFiles: discoveredFiles.length,
          files: discoveredFiles.map((f) => f.path),
        },
        timestamp: new Date(),
      });

      // Start conversion in background
      const concurrency = body.concurrency ?? 3;
      const skipConverted = body.skipConverted ?? true;

      // Don't await - let it run in background
      context.processManager
        .convertBatch(discoveredFiles, jobId, {
          concurrency,
          skipConverted,
          onStart: (file) => {
            context.eventEmitter.emit('server-event', {
              type: 'conversion-progress',
              data: {
                jobId,
                filePath: file.path,
                status: 'started',
              },
              timestamp: new Date(),
            });
          },
          onComplete: (result) => {
            context.eventEmitter.emit('server-event', {
              type: 'conversion-progress',
              data: {
                jobId,
                filePath: result.filePath,
                status: result.success ? 'completed' : 'failed',
                error: result.error,
                duration: result.duration,
              },
              timestamp: new Date(),
            });

            // Also emit log update event
            context.eventEmitter.emit('server-event', {
              type: 'file-log-update',
              data: {
                jobId,
                filePath: result.filePath,
                stdout: result.stdout,
                stderr: result.stderr,
              },
              timestamp: new Date(),
            });

            // Invalidate cache for this file's directory
            context.scanCache.invalidateForFile(result.filePath);
          },
          onProgress: (completed, total) => {
            context.eventEmitter.emit('server-event', {
              type: 'conversion-progress',
              data: {
                jobId,
                completed,
                total,
                percentComplete: Math.round((completed / total) * 100),
              },
              timestamp: new Date(),
            });
          },
        })
        .then(() => {
          const stats = context.conversionState.getBatchStats(jobId);
          context.eventEmitter.emit('server-event', {
            type: 'conversion-complete',
            data: {
              jobId,
              stats,
            },
            timestamp: new Date(),
          });
        })
        .catch((error) => {
          logger.error(`Batch conversion error: ${error.message}`);
          context.eventEmitter.emit('server-event', {
            type: 'error',
            data: {
              jobId,
              error: error.message,
              operation: 'convert',
            },
            timestamp: new Date(),
          });
        });

      // Return immediately with job ID
      return res.status(202).json({
        jobId,
        message: 'Conversion started',
        totalFiles: discoveredFiles.length,
        validationErrors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(`Convert failed: ${message}`);
      return res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/convert/status/:jobId
   * Get the status of a conversion job
   */
  router.get('/status/:jobId', (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const batch = context.conversionState.getBatch(jobId);

      if (!batch) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const stats = context.conversionState.getBatchStats(jobId);
      const records = Array.from(batch.records.values());

      return res.json({
        jobId: batch.jobId,
        rootPath: batch.rootPath,
        createdAt: batch.createdAt,
        stats,
        files: records.map((r) => ({
          path: r.filePath,
          status: r.status,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          duration: r.duration,
          error: r.error,
          outputPath: r.outputPath,
        })),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/convert/logs/:jobId/:fileIndex
   * Get logs for a specific file in a job (by index)
   */
  router.get('/logs/:jobId/:fileIndex', (req: Request, res: Response) => {
    try {
      const { jobId, fileIndex } = req.params;
      const batch = context.conversionState.getBatch(jobId);

      if (!batch) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const records = Array.from(batch.records.values());
      const index = parseInt(fileIndex, 10);

      if (isNaN(index) || index < 0 || index >= records.length) {
        return res.status(404).json({
          error: 'File index out of range',
          totalFiles: records.length,
        });
      }

      const record = records[index];

      return res.json({
        filePath: record.filePath,
        status: record.status,
        stdout: record.stdout || '',
        stderr: record.stderr || '',
        error: record.error,
        duration: record.duration,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/convert/logs/:jobId/file/*
   * Get logs for a specific file in a job (by file path)
   */
  router.get('/logs/:jobId/file/*', (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      // Get the file path from the wildcard - req.params[0] contains everything after /file/
      const filePath = req.params[0];

      if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
      }

      const batch = context.conversionState.getBatch(jobId);

      if (!batch) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Normalize the file path
      const normalizedPath = path.normalize(filePath);

      // Find the record by path (try both normalized and original)
      let record = batch.records.get(normalizedPath);
      if (!record) {
        record = batch.records.get(filePath);
      }
      if (!record) {
        // Try to find by ending match
        for (const [key, value] of batch.records.entries()) {
          if (key.endsWith(normalizedPath) || normalizedPath.endsWith(key)) {
            record = value;
            break;
          }
        }
      }

      if (!record) {
        return res.status(404).json({
          error: 'File not found in job',
          availableFiles: Array.from(batch.records.keys()),
        });
      }

      return res.json({
        filePath: record.filePath,
        status: record.status,
        stdout: record.stdout || '',
        stderr: record.stderr || '',
        error: record.error,
        duration: record.duration,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/convert/cancel/:jobId
   * Cancel a running conversion job
   */
  router.post('/cancel/:jobId', (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const batch = context.conversionState.getBatch(jobId);

      if (!batch) {
        return res.status(404).json({ error: 'Job not found' });
      }

      context.processManager.cancelAll();

      context.eventEmitter.emit('server-event', {
        type: 'conversion-complete',
        data: {
          jobId,
          cancelled: true,
          stats: context.conversionState.getBatchStats(jobId),
        },
        timestamp: new Date(),
      });

      return res.json({
        success: true,
        message: 'Conversion cancelled',
        jobId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/convert/jobs
   * List all conversion jobs
   */
  router.get('/jobs', (_req: Request, res: Response) => {
    try {
      const batches = context.conversionState.getAllBatches();

      const jobs = batches.map((batch) => ({
        jobId: batch.jobId,
        rootPath: batch.rootPath,
        createdAt: batch.createdAt,
        stats: context.conversionState.getBatchStats(batch.jobId),
      }));

      return res.json({ jobs });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  /**
   * DELETE /api/convert/jobs/:jobId
   * Clear/delete a conversion job
   */
  router.delete('/jobs/:jobId', (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const batch = context.conversionState.getBatch(jobId);

      if (!batch) {
        return res.status(404).json({ error: 'Job not found' });
      }

      context.conversionState.clearBatch(jobId);

      return res.json({
        success: true,
        message: 'Job deleted',
        jobId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
