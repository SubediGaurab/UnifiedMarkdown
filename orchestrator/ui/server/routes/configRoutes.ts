import { Router, Request, Response } from 'express';
import { ConfigService } from '../../../../core/services/ConfigService.js';
import { logger } from '../../../../core/utils/logger.js';

interface EditableConfig {
  geminiApiKey?: string;
  geminiOcrModel?: string;
  geminiTextModel?: string;

  openaiEndpoint?: string;
  openaiApiKey?: string;
  openaiOcrModel?: string;
  openaiTextModel?: string;
}

export function createConfigRoutes(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    try {
      const config = ConfigService.readConfig();
      res.json({
        geminiApiKey: config.geminiApiKey ? '••••' + config.geminiApiKey.slice(-4) : '',
        hasApiKey: !!config.geminiApiKey,
        geminiOcrModel: config.geminiOcrModel || 'gemini-3.1-pro-preview',
        geminiTextModel: config.geminiTextModel || 'gemini-3-flash-preview',
        
        openaiEndpoint: config.openaiEndpoint || '',
        openaiApiKey: config.openaiApiKey ? '••••' + config.openaiApiKey.slice(-4) : '',
        hasOpenaiApiKey: !!config.openaiApiKey,
        openaiOcrModel: config.openaiOcrModel || 'gpt-4o',
        openaiTextModel: config.openaiTextModel || 'gpt-4o-mini',

        configPath: ConfigService.getConfigPath(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to read config: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  router.get('/apikey', (_req: Request, res: Response) => {
    res.json({ hasApiKey: ConfigService.hasGeminiApiKey() });
  });

  router.put('/', (req: Request, res: Response) => {
    try {
      const body = req.body as EditableConfig;
      const config = ConfigService.readConfig();

      if (body.geminiApiKey !== undefined) config.geminiApiKey = body.geminiApiKey;
      if (body.geminiOcrModel !== undefined) config.geminiOcrModel = body.geminiOcrModel;
      if (body.geminiTextModel !== undefined) config.geminiTextModel = body.geminiTextModel;

      if (body.openaiEndpoint !== undefined) config.openaiEndpoint = body.openaiEndpoint;
      if (body.openaiApiKey !== undefined) config.openaiApiKey = body.openaiApiKey;
      if (body.openaiOcrModel !== undefined) config.openaiOcrModel = body.openaiOcrModel;
      if (body.openaiTextModel !== undefined) config.openaiTextModel = body.openaiTextModel;

      ConfigService.writeConfig(config);
      logger.info('Configuration updated via API');

      // Return refreshed config so the client doesn't need a second GET
      res.json({
        success: true,
        message: 'Configuration saved',
        config: {
          geminiApiKey: config.geminiApiKey ? '••••' + config.geminiApiKey.slice(-4) : '',
          hasApiKey: !!config.geminiApiKey,
          geminiOcrModel: config.geminiOcrModel || 'gemini-3.1-pro-preview',
          geminiTextModel: config.geminiTextModel || 'gemini-3-flash-preview',
          openaiEndpoint: config.openaiEndpoint || '',
          openaiApiKey: config.openaiApiKey ? '••••' + config.openaiApiKey.slice(-4) : '',
          hasOpenaiApiKey: !!config.openaiApiKey,
          openaiOcrModel: config.openaiOcrModel || 'gpt-4o',
          openaiTextModel: config.openaiTextModel || 'gpt-4o-mini',
          configPath: ConfigService.getConfigPath(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to update config: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
