import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse as parseEnv } from 'dotenv';

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'MISSING_SETTING'
      | 'CONFIG_READ_ERROR'
      | 'CONFIG_WRITE_ERROR'
      | 'INVALID_INPUT'
  ) {
    super(message);
    this.name = 'ConfigError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConfigError);
    }
  }
}

/**
 * Every setting UnifiedMarkdown reads. All of them live in one file,
 * ~/.umd/.env, which is the only source of truth: there are no built-in
 * default models, no provider fallbacks, and shell environment variables
 * are not consulted.
 */
export const ENV_KEYS = {
  geminiApiKey: 'GEMINI_API_KEY',
  geminiOcrModel: 'GEMINI_OCR_MODEL',
  geminiTextModel: 'GEMINI_TEXT_MODEL',
  openaiBaseUrl: 'OPENAI_BASE_URL',
  openaiApiKey: 'OPENAI_API_KEY',
  openaiOcrModel: 'OPENAI_OCR_MODEL',
  openaiTextModel: 'OPENAI_TEXT_MODEL',
} as const;

export type EnvKey = (typeof ENV_KEYS)[keyof typeof ENV_KEYS];

/** Settings needed for the Gemini provider (the normal path). */
export const GEMINI_REQUIRED: EnvKey[] = [
  ENV_KEYS.geminiApiKey,
  ENV_KEYS.geminiOcrModel,
  ENV_KEYS.geminiTextModel,
];

/** Settings needed when --use-openai is passed. */
export const OPENAI_REQUIRED: EnvKey[] = [
  ENV_KEYS.openaiBaseUrl,
  ENV_KEYS.openaiApiKey,
  ENV_KEYS.openaiOcrModel,
  ENV_KEYS.openaiTextModel,
];

export class ConfigService {
  private static readonly CONFIG_DIR = path.join(os.homedir(), '.umd');
  private static readonly ENV_FILE = path.join(
    ConfigService.CONFIG_DIR,
    '.env'
  );

  /** Path of the single settings file. */
  static getEnvPath(): string {
    return ConfigService.ENV_FILE;
  }

  /** Read and parse ~/.umd/.env. A missing file means no settings. */
  static readEnv(): Record<string, string> {
    try {
      if (!fs.existsSync(ConfigService.ENV_FILE)) return {};
      return parseEnv(fs.readFileSync(ConfigService.ENV_FILE));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ConfigError(
        `Failed to read ${ConfigService.ENV_FILE}: ${detail}`,
        'CONFIG_READ_ERROR'
      );
    }
  }

  static getOptional(key: EnvKey): string | undefined {
    const value = this.readEnv()[key]?.trim();
    return value ? value : undefined;
  }

  static getRequired(key: EnvKey): string {
    const value = this.getOptional(key);
    if (!value) {
      throw new ConfigError(this.missingMessage([key]), 'MISSING_SETTING');
    }
    return value;
  }

  /** Names of the given settings that are not set in the .env file. */
  static missing(keys: EnvKey[]): EnvKey[] {
    const env = this.readEnv();
    return keys.filter((key) => !env[key]?.trim());
  }

  /** Throw one clear error listing every missing setting. */
  static assertSet(keys: EnvKey[]): void {
    const missing = this.missing(keys);
    if (missing.length > 0) {
      throw new ConfigError(this.missingMessage(missing), 'MISSING_SETTING');
    }
  }

  /** Check the settings a conversion needs before any work starts. */
  static assertProviderConfigured(useOpenAI: boolean = false): void {
    this.assertSet(useOpenAI ? OPENAI_REQUIRED : GEMINI_REQUIRED);
  }

  private static missingMessage(keys: EnvKey[]): string {
    const names = keys.join(', ');
    return (
      `Missing required setting${keys.length > 1 ? 's' : ''} ${names} in ${ConfigService.ENV_FILE}. ` +
      `UnifiedMarkdown has no default models; set ${keys.length > 1 ? 'them' : 'it'} there ` +
      '(run `umd setup` or edit the file).'
    );
  }

  /**
   * Set or remove values in ~/.umd/.env, keeping every other line as is.
   * An empty or undefined value removes the key.
   */
  static writeEnv(updates: Partial<Record<EnvKey, string | undefined>>): void {
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && /[\r\n]/.test(value)) {
        throw new ConfigError(
          `Value for ${key} cannot contain a line break`,
          'INVALID_INPUT'
        );
      }
    }
    try {
      if (!fs.existsSync(ConfigService.CONFIG_DIR)) {
        fs.mkdirSync(ConfigService.CONFIG_DIR, {
          recursive: true,
          mode: 0o700,
        });
      }
      const lines = fs.existsSync(ConfigService.ENV_FILE)
        ? fs.readFileSync(ConfigService.ENV_FILE, 'utf-8').split(/\r?\n/)
        : [];
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

      for (const [key, raw] of Object.entries(updates)) {
        const value = raw?.trim();
        const pattern = new RegExp(`^\\s*(export\\s+)?${key}\\s*=`);
        const index = lines.findIndex((line) => pattern.test(line));
        if (!value) {
          if (index >= 0) lines.splice(index, 1);
          continue;
        }
        const line = `${key}=${JSON.stringify(value)}`;
        if (index >= 0) lines[index] = line;
        else lines.push(line);
      }

      fs.writeFileSync(ConfigService.ENV_FILE, lines.join('\n') + '\n', {
        encoding: 'utf-8',
        mode: 0o600,
      });
      fs.chmodSync(ConfigService.ENV_FILE, 0o600);
    } catch (error) {
      if (error instanceof ConfigError) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      throw new ConfigError(
        `Failed to write ${ConfigService.ENV_FILE}: ${detail}`,
        'CONFIG_WRITE_ERROR'
      );
    }
  }

  // --- Gemini ---

  static getGeminiApiKey(): string {
    return this.getRequired(ENV_KEYS.geminiApiKey);
  }

  static hasGeminiApiKey(): boolean {
    return !!this.getOptional(ENV_KEYS.geminiApiKey);
  }

  static getGeminiOcrModel(): string {
    return this.getRequired(ENV_KEYS.geminiOcrModel);
  }

  static getGeminiTextModel(): string {
    return this.getRequired(ENV_KEYS.geminiTextModel);
  }

  // --- OpenAI compatible ---

  static getOpenaiBaseUrl(): string {
    return this.getRequired(ENV_KEYS.openaiBaseUrl);
  }

  static getOpenaiApiKey(): string {
    return this.getRequired(ENV_KEYS.openaiApiKey);
  }

  static getOpenaiOcrModel(): string {
    return this.getRequired(ENV_KEYS.openaiOcrModel);
  }

  static getOpenaiTextModel(): string {
    return this.getRequired(ENV_KEYS.openaiTextModel);
  }
}
