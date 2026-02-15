import express, { Express, Request, Response, NextFunction } from 'express';
import * as http from 'http';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { UIConfig } from '../../../core/interfaces/IConfig.js';
import { logger } from '../../../core/utils/logger.js';
import { FileDiscoveryService } from '../../services/FileDiscoveryService.js';
import { ConversionStateService } from '../../services/ConversionStateService.js';
import { ProcessManagerService } from '../../services/ProcessManagerService.js';
import { SkillsService } from '../../services/SkillsService.js';
import { ExclusionService } from '../services/ExclusionService.js';
import { ScanCacheService } from '../services/ScanCacheService.js';
import { EventEmitter } from 'events';

// Import routes
import { createScanRoutes } from './routes/scanRoutes.js';
import { createConvertRoutes } from './routes/convertRoutes.js';
import { createExclusionRoutes } from './routes/exclusionRoutes.js';
import { createEventsRoutes } from './routes/eventsRoutes.js';

/**
 * Event types that can be emitted by the server
 */
export type ServerEventType =
  | 'scan-start'
  | 'scan-progress'
  | 'scan-complete'
  | 'conversion-start'
  | 'conversion-progress'
  | 'conversion-complete'
  | 'file-log-update'
  | 'error';

/**
 * Server event payload
 */
export interface ServerEvent {
  type: ServerEventType;
  data: unknown;
  timestamp: Date;
}

/**
 * Context object passed to route handlers
 */
export interface RouteContext {
  fileDiscovery: FileDiscoveryService;
  conversionState: ConversionStateService;
  processManager: ProcessManagerService;
  exclusionService: ExclusionService;
  scanCache: ScanCacheService;
  eventEmitter: EventEmitter;
}

/**
 * Express server for the UI wrapper.
 * Provides REST API endpoints for scanning, conversion, and exclusion management.
 */
export class UIServerService {
  private app: Express;
  private server: http.Server | null = null;
  private config: Required<UIConfig>;
  private eventEmitter: EventEmitter;
  private context: RouteContext;

  constructor(uiConfig?: UIConfig, dataLocation?: string) {
    this.config = {
      port: uiConfig?.port ?? 3000,
      host: uiConfig?.host ?? 'localhost',
      openBrowserOnStart: uiConfig?.openBrowserOnStart ?? false,
    };

    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100); // Allow many SSE clients

    // Initialize services
    const exclusionService = new ExclusionService(dataLocation);
    const scanCache = new ScanCacheService(dataLocation);
    const fileDiscovery = new FileDiscoveryService();
    const conversionState = new ConversionStateService();
    // Pass the shared conversionState to processManager to ensure consistent state
    const processManager = new ProcessManagerService(conversionState);

    this.context = {
      fileDiscovery,
      conversionState,
      processManager,
      exclusionService,
      scanCache,
      eventEmitter: this.eventEmitter,
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // JSON body parser
    this.app.use(express.json());

    // URL-encoded body parser
    this.app.use(express.urlencoded({ extended: true }));

    // CORS for development
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // API routes
    this.app.use('/api/scan', createScanRoutes(this.context));
    this.app.use('/api/convert', createConvertRoutes(this.context));
    this.app.use('/api/exclusions', createExclusionRoutes(this.context));
    this.app.use('/api/events', createEventsRoutes(this.context));

    // Health check
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // Skills status - check if Claude Code skills are available
    this.app.get('/api/skills/status', (_req: Request, res: Response) => {
      try {
        const skillsInfo = SkillsService.getSkillsInfo();
        res.json({
          claudeCodeReady: skillsInfo.claudeCodeReady,
          availableSkills: skillsInfo.installedSkills,
          missingSkills: skillsInfo.missingSkills,
          userSkillsPath: skillsInfo.userSkillsPath,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
      }
    });

    // Serve static files for React frontend (when built)
    // Resolve from this file's location (dist/orchestrator/ui/server/) to project root
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRoot = path.join(__dirname, '..', '..', '..', '..');
    const clientDistPath = path.join(
      projectRoot,
      'orchestrator',
      'ui',
      'client',
      'dist'
    );
    this.app.use(express.static(clientDistPath));

    // SPA fallback - serve index.html for any non-API routes
    this.app.get('*', (req: Request, res: Response) => {
      if (!req.path.startsWith('/api')) {
        const indexPath = path.join(clientDistPath, 'index.html');
        res.sendFile(indexPath, (err) => {
          if (err) {
            res.status(200).json({
              message: 'UI not built yet. Run the frontend build first.',
              apiAvailable: true,
              endpoints: [
                'GET /api/health',
                'GET /api/scan/result',
                'POST /api/scan',
                'POST /api/convert',
                'GET /api/convert/status/:jobId',
                'GET /api/convert/logs/:jobId/:fileIndex',
                'POST /api/convert/cancel/:jobId',
                'GET /api/exclusions',
                'POST /api/exclusions',
                'DELETE /api/exclusions/:id',
                'GET /api/events (SSE)',
              ],
            });
          }
        });
      }
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // 404 handler for API routes
    this.app.use('/api/*', (_req: Request, res: Response) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Global error handler
    this.app.use(
      (err: Error, _req: Request, res: Response, _next: NextFunction) => {
        logger.error(`Server error: ${err.message}`);
        res.status(500).json({
          error: 'Internal server error',
          message: err.message,
        });
      }
    );
  }

  /**
   * Emit an event to all SSE clients
   */
  emit(type: ServerEventType, data: unknown): void {
    const event: ServerEvent = {
      type,
      data,
      timestamp: new Date(),
    };
    this.eventEmitter.emit('server-event', event);
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(
          this.config.port,
          this.config.host,
          () => {
            const url = `http://${this.config.host}:${this.config.port}`;
            logger.success(`UI server started at ${url}`);
            console.log(`\n  UI Server running at: ${url}`);
            console.log('  API endpoints available at: /api/*\n');

            if (this.config.openBrowserOnStart) {
              this.openBrowser(url);
            }

            resolve();
          }
        );

        this.server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            logger.error(
              `Port ${this.config.port} is already in use. Try a different port.`
            );
          }
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('UI server stopped');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the Express app instance (for testing)
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Get the route context (for testing)
   */
  getContext(): RouteContext {
    return this.context;
  }

  /**
   * Open URL in default browser
   */
  private openBrowser(url: string): void {
    const { exec } = require('child_process');
    const platform = process.platform;

    let command: string;
    if (platform === 'win32') {
      command = `start ${url}`;
    } else if (platform === 'darwin') {
      command = `open ${url}`;
    } else {
      command = `xdg-open ${url}`;
    }

    exec(command, (err: Error | null) => {
      if (err) {
        logger.error(`Failed to open browser: ${err.message}`);
      }
    });
  }
}
