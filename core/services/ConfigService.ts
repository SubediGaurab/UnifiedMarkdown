import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { UmdConfig } from '../interfaces/IConfig.js';

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'API_KEY_NOT_FOUND'
      | 'CONFIG_READ_ERROR'
      | 'CONFIG_WRITE_ERROR'
      | 'INVALID_CONFIG'
      | 'PERMISSION_DENIED'
      | 'INVALID_INPUT'
  ) {
    super(message);
    this.name = 'ConfigError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConfigError);
    }
  }
}

export class ConfigService {
  private static readonly CONFIG_DIR = path.join(os.homedir(), '.umd');
  private static readonly CONFIG_FILE = path.join(
    ConfigService.CONFIG_DIR,
    'config.json'
  );

  /** Legacy field migration map: old key -> new key */
  private static readonly MIGRATIONS: Record<string, keyof UmdConfig> = {
    apiKey: 'geminiApiKey',
    aiEndpoint: 'openaiEndpoint',
    ocrModel: 'geminiOcrModel',
    textModel: 'geminiTextModel',
  };

  static readConfig(): UmdConfig {
    try {
      if (!fs.existsSync(ConfigService.CONFIG_FILE)) {
        return {};
      }

      const content = fs.readFileSync(ConfigService.CONFIG_FILE, 'utf-8');
      let parsedConfig: any;
      try {
        parsedConfig = JSON.parse(content);
      } catch {
        throw new ConfigError(
          `Invalid JSON in config file: ${ConfigService.CONFIG_FILE}`,
          'INVALID_CONFIG'
        );
      }

      // Migrate legacy flat config keys
      let modified = false;
      for (const [oldKey, newKey] of Object.entries(this.MIGRATIONS)) {
        if (parsedConfig[oldKey]) {
          parsedConfig[newKey] = parsedConfig[oldKey];
          delete parsedConfig[oldKey];
          modified = true;
        }
      }

      if (modified) {
        this.writeConfig(parsedConfig);
      }

      return parsedConfig as UmdConfig;
    } catch (error) {
      if (error instanceof ConfigError) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      throw new ConfigError(`Failed to read config: ${detail}`, 'CONFIG_READ_ERROR');
    }
  }

  static writeConfig(config: UmdConfig): void {
    if (!config || typeof config !== 'object') {
      throw new ConfigError('Config must be a non-null object', 'INVALID_INPUT');
    }
    try {
      if (!fs.existsSync(ConfigService.CONFIG_DIR)) {
        fs.mkdirSync(ConfigService.CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(ConfigService.CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ConfigError(`Failed to write config: ${detail}`, 'CONFIG_WRITE_ERROR');
    }
  }

  // --- Generic helpers to reduce getter/setter boilerplate ---

  private static getConfigValue(
    key: keyof UmdConfig,
    envVars: string[],
    defaultValue?: string
  ): string | undefined {
    const config = this.readConfig();
    const stored = config[key] as string | undefined;
    if (stored) return stored;

    for (const envVar of envVars) {
      const val = process.env[envVar];
      if (val) return val;
    }

    return defaultValue;
  }

  private static saveConfigValue(key: keyof UmdConfig, value: string | undefined): void {
    const config = this.readConfig();
    if (value?.trim()) {
      (config as any)[key] = value.trim();
    } else {
      delete (config as any)[key];
    }
    this.writeConfig(config);
  }

  // --- Gemini ---

  static getGeminiApiKey(): string {
    const val = this.getConfigValue('geminiApiKey', ['GEMINI_API_KEY']);
    if (!val) throw new ConfigError('No Gemini API key found. Run `umd setup` or set GEMINI_API_KEY.', 'API_KEY_NOT_FOUND');
    return val;
  }

  static saveGeminiApiKey(apiKey: string): void { this.saveConfigValue('geminiApiKey', apiKey); }

  static hasGeminiApiKey(): boolean {
    return !!this.getConfigValue('geminiApiKey', ['GEMINI_API_KEY']);
  }

  static getGeminiOcrModel(): string {
    return this.getConfigValue('geminiOcrModel', [], 'gemini-3.1-pro-preview')!;
  }

  static saveGeminiOcrModel(model: string): void { this.saveConfigValue('geminiOcrModel', model); }

  static getGeminiTextModel(): string {
    return this.getConfigValue('geminiTextModel', [], 'gemini-3-flash-preview')!;
  }

  static saveGeminiTextModel(model: string): void { this.saveConfigValue('geminiTextModel', model); }

  // --- OpenAI ---

  static getOpenaiEndpoint(): string | undefined {
    return this.getConfigValue('openaiEndpoint', ['AI_ENDPOINT', 'OPENAI_BASE_URL']);
  }

  static saveOpenaiEndpoint(endpoint: string | undefined): void { this.saveConfigValue('openaiEndpoint', endpoint); }

  static getOpenaiApiKey(): string | undefined {
    return this.getConfigValue('openaiApiKey', ['OPENAI_API_KEY']);
  }

  static saveOpenaiApiKey(apiKey: string | undefined): void { this.saveConfigValue('openaiApiKey', apiKey); }

  static getOpenaiOcrModel(): string {
    return this.getConfigValue('openaiOcrModel', [], 'gpt-4o')!;
  }

  static saveOpenaiOcrModel(model: string): void { this.saveConfigValue('openaiOcrModel', model); }

  static getOpenaiTextModel(): string {
    return this.getConfigValue('openaiTextModel', [], 'gpt-4o-mini')!;
  }

  static saveOpenaiTextModel(model: string): void { this.saveConfigValue('openaiTextModel', model); }

  // Utility
  static getConfigPath(): string {
    return ConfigService.CONFIG_FILE;
  }
}
