import { Router, Request, Response } from 'express';
import {
  ConfigService,
  ENV_KEYS,
  GEMINI_REQUIRED,
  OPENAI_REQUIRED,
} from '../../../../core/services/ConfigService.js';
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

const mask = (value: string | undefined) =>
  value ? '••••' + value.slice(-4) : '';

/** Current settings from ~/.umd/.env. Unset values are empty; nothing is filled in. */
function publicConfig() {
  const env = ConfigService.readEnv();
  const get = (key: string) => env[key]?.trim() || '';
  return {
    geminiApiKey: mask(get(ENV_KEYS.geminiApiKey)),
    hasApiKey: !!get(ENV_KEYS.geminiApiKey),
    geminiOcrModel: get(ENV_KEYS.geminiOcrModel),
    geminiTextModel: get(ENV_KEYS.geminiTextModel),

    openaiEndpoint: get(ENV_KEYS.openaiBaseUrl),
    openaiApiKey: mask(get(ENV_KEYS.openaiApiKey)),
    hasOpenaiApiKey: !!get(ENV_KEYS.openaiApiKey),
    openaiOcrModel: get(ENV_KEYS.openaiOcrModel),
    openaiTextModel: get(ENV_KEYS.openaiTextModel),

    missingGemini: ConfigService.missing(GEMINI_REQUIRED),
    missingOpenai: ConfigService.missing(OPENAI_REQUIRED),
    configPath: ConfigService.getEnvPath(),
  };
}

export function createConfigRoutes(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    try {
      res.json(publicConfig());
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
      const updates: Record<string, string | undefined> = {};

      // API keys are only replaced when a new one is sent; an empty key field means "keep".
      if (body.geminiApiKey) updates[ENV_KEYS.geminiApiKey] = body.geminiApiKey;
      if (body.geminiOcrModel !== undefined)
        updates[ENV_KEYS.geminiOcrModel] = body.geminiOcrModel;
      if (body.geminiTextModel !== undefined)
        updates[ENV_KEYS.geminiTextModel] = body.geminiTextModel;

      if (body.openaiEndpoint !== undefined)
        updates[ENV_KEYS.openaiBaseUrl] = body.openaiEndpoint;
      if (body.openaiApiKey) updates[ENV_KEYS.openaiApiKey] = body.openaiApiKey;
      if (body.openaiOcrModel !== undefined)
        updates[ENV_KEYS.openaiOcrModel] = body.openaiOcrModel;
      if (body.openaiTextModel !== undefined)
        updates[ENV_KEYS.openaiTextModel] = body.openaiTextModel;

      ConfigService.writeEnv(updates);
      logger.info('Settings updated via API');

      res.json({
        success: true,
        message: 'Settings saved',
        config: publicConfig(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to update config: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
