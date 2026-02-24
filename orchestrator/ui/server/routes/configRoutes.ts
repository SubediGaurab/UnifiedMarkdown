import { Router, Request, Response } from 'express';
import { ConfigService } from '../../../../core/services/ConfigService.js';
import { logger } from '../../../../core/utils/logger.js';

/**
 * Editable config fields (subset of UmdConfig that lives in config.json)
 */
interface EditableConfig {
  apiKey?: string;
  ocrModel?: string;
  textModel?: string;
}

/**
 * Create config routes
 */
export function createConfigRoutes(): Router {
  const router = Router();

  /**
   * GET /api/config
   * Get current configuration (masks API key)
   */
  router.get('/', (_req: Request, res: Response) => {
    try {
      const config = ConfigService.readConfig();
      res.json({
        apiKey: config.apiKey ? '••••' + config.apiKey.slice(-4) : '',
        hasApiKey: !!config.apiKey,
        ocrModel: config.ocrModel || 'gemini-3.1-pro-preview',
        textModel: config.textModel || 'gemini-3-flash-preview',
        configPath: ConfigService.getConfigPath(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read config';
      logger.error(`Config read failed: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/config/apikey
   * Get the unmasked API key (for show/hide toggle)
   */
  router.get('/apikey', (_req: Request, res: Response) => {
    try {
      const config = ConfigService.readConfig();
      res.json({ apiKey: config.apiKey || '' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read config';
      logger.error(`Config read failed: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  /**
   * PUT /api/config
   * Update configuration fields
   */
  router.put('/', (req: Request, res: Response) => {
    try {
      const body = req.body as EditableConfig;
      const config = ConfigService.readConfig();

      if (body.apiKey !== undefined) {
        config.apiKey = body.apiKey;
      }
      if (body.ocrModel !== undefined) {
        config.ocrModel = body.ocrModel;
      }
      if (body.textModel !== undefined) {
        config.textModel = body.textModel;
      }

      ConfigService.writeConfig(config);

      res.json({
        success: true,
        message: 'Configuration updated',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save config';
      logger.error(`Config write failed: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
