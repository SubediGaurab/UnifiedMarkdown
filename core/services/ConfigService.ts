import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger.js';
import { UmdConfig } from '../interfaces/IConfig.js';

/**
 * Custom error class for configuration-related errors
 */
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
    // Maintains proper stack trace for where our error was thrown (only available on V8)
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

  /**
   * Get the Gemini API key from config file or environment variable
   * Priority: config file -> environment variable -> throw ConfigError
   * @returns The Gemini API key
   * @throws {ConfigError} If no API key is found in config file or environment
   */
  static getApiKey(): string {
    // Try config file first
    const config = this.readConfig();
    if (config.apiKey) {
      logger.debug('Using API key from config file');
      return config.apiKey;
    }

    // Fallback to environment variable
    const envApiKey = process.env.GEMINI_API_KEY;
    if (envApiKey) {
      logger.debug('Using API key from GEMINI_API_KEY environment variable');
      return envApiKey;
    }

    // No API key found
    throw new ConfigError(
      'No Gemini API key found. Please run "umd setup" to configure your API key, ' +
        'or set the GEMINI_API_KEY environment variable.',
      'API_KEY_NOT_FOUND'
    );
  }

  /**
   * Read the config file, returns empty config if file doesn't exist
   * @returns The parsed config object, or empty object if file doesn't exist
   * @throws {ConfigError} If config file is malformed or cannot be read due to permissions
   */
  static readConfig(): UmdConfig {
    try {
      if (!fs.existsSync(ConfigService.CONFIG_FILE)) {
        logger.debug('Config file does not exist, returning empty config');
        return {};
      }

      const content = fs.readFileSync(ConfigService.CONFIG_FILE, 'utf-8');

      // Try to parse the JSON content
      let parsedConfig: unknown;
      try {
        parsedConfig = JSON.parse(content);
      } catch (parseError) {
        logger.error(
          `Config file at ${ConfigService.CONFIG_FILE} contains invalid JSON`
        );
        throw new ConfigError(
          `Config file is malformed (invalid JSON). Please check ${ConfigService.CONFIG_FILE} or delete it to reset. ` +
            `Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          'INVALID_CONFIG'
        );
      }

      // Validate that the parsed content is an object
      if (typeof parsedConfig !== 'object' || parsedConfig === null) {
        throw new ConfigError(
          `Config file must contain a JSON object. Found: ${typeof parsedConfig}`,
          'INVALID_CONFIG'
        );
      }

      logger.debug('Successfully read config file');
      return parsedConfig as UmdConfig;
    } catch (error) {
      // Re-throw ConfigError instances
      if (error instanceof ConfigError) {
        throw error;
      }

      // Handle filesystem errors
      if (error instanceof Error) {
        if ('code' in error && error.code === 'EACCES') {
          throw new ConfigError(
            `Permission denied reading config file at ${ConfigService.CONFIG_FILE}. ` +
              `Please check file permissions.`,
            'PERMISSION_DENIED'
          );
        }
        throw new ConfigError(
          `Failed to read config file at ${ConfigService.CONFIG_FILE}: ${error.message}`,
          'CONFIG_READ_ERROR'
        );
      }

      // Fallback for unknown error types
      throw new ConfigError(
        `Failed to read config file: ${String(error)}`,
        'CONFIG_READ_ERROR'
      );
    }
  }

  /**
   * Write the config file, creates directory if needed
   * @param config - The configuration object to save
   * @throws {ConfigError} If config cannot be written or directory cannot be created
   */
  static writeConfig(config: UmdConfig): void {
    // Validate input
    if (!config || typeof config !== 'object') {
      throw new ConfigError(
        'Invalid config object provided to writeConfig(). Config must be a non-null object.',
        'INVALID_INPUT'
      );
    }

    try {
      // Create config directory if it doesn't exist
      if (!fs.existsSync(ConfigService.CONFIG_DIR)) {
        try {
          fs.mkdirSync(ConfigService.CONFIG_DIR, { recursive: true });
          logger.debug(`Created config directory: ${ConfigService.CONFIG_DIR}`);
        } catch (mkdirError) {
          if (
            mkdirError instanceof Error &&
            'code' in mkdirError &&
            mkdirError.code === 'EACCES'
          ) {
            throw new ConfigError(
              `Permission denied creating config directory at ${ConfigService.CONFIG_DIR}. ` +
                `Please check parent directory permissions.`,
              'PERMISSION_DENIED'
            );
          }
          throw mkdirError; // Will be caught by outer try-catch
        }
      }

      // Write config file
      try {
        fs.writeFileSync(
          ConfigService.CONFIG_FILE,
          JSON.stringify(config, null, 2),
          'utf-8'
        );
        logger.debug(`Config saved to ${ConfigService.CONFIG_FILE}`);
      } catch (writeError) {
        if (
          writeError instanceof Error &&
          'code' in writeError &&
          writeError.code === 'EACCES'
        ) {
          throw new ConfigError(
            `Permission denied writing config file to ${ConfigService.CONFIG_FILE}. ` +
              `Please check file and directory permissions.`,
            'PERMISSION_DENIED'
          );
        }
        throw writeError; // Will be caught by outer try-catch
      }
    } catch (error) {
      // Re-throw ConfigError instances
      if (error instanceof ConfigError) {
        throw error;
      }

      // Handle other errors
      if (error instanceof Error) {
        throw new ConfigError(
          `Failed to write config file to ${ConfigService.CONFIG_FILE}: ${error.message}`,
          'CONFIG_WRITE_ERROR'
        );
      }

      // Fallback for unknown error types
      throw new ConfigError(
        `Failed to write config file: ${String(error)}`,
        'CONFIG_WRITE_ERROR'
      );
    }
  }

  /**
   * Save API key to config file
   * @param apiKey - The Gemini API key to save
   * @throws {ConfigError} If API key is empty or config cannot be written
   */
  static saveApiKey(apiKey: string): void {
    // Validate input
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new ConfigError(
        'API key cannot be empty. Please provide a valid Gemini API key.',
        'INVALID_INPUT'
      );
    }

    const config = this.readConfig();
    config.apiKey = apiKey.trim();
    this.writeConfig(config);
    logger.debug('API key saved successfully');
  }

  /**
   * Check if API key is configured (either in config file or environment)
   */
  static hasApiKey(): boolean {
    try {
      this.getApiKey();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the config file path for display purposes
   */
  static getConfigPath(): string {
    return ConfigService.CONFIG_FILE;
  }

  /**
   * Get the Gemini model for OCR operations (images, PDFs, PPTX)
   * @returns The configured OCR model or default 'gemini-3-pro-preview'
   */
  static getOcrModel(): string {
    const config = this.readConfig();
    return config.ocrModel || 'gemini-3-pro-preview';
  }

  /**
   * Get the Gemini model for text operations (summaries, captions)
   * @returns The configured text model or default 'gemini-2.5-flash'
   */
  static getTextModel(): string {
    const config = this.readConfig();
    return config.textModel || 'gemini-2.5-flash';
  }

  /**
   * Save OCR model preference to config file
   * @param model - The Gemini model name to use for OCR operations
   * @throws {ConfigError} If model name is empty or config cannot be written
   */
  static saveOcrModel(model: string): void {
    // Validate input
    if (!model || typeof model !== 'string' || model.trim().length === 0) {
      throw new ConfigError(
        'Model name cannot be empty. Please provide a valid Gemini model name.',
        'INVALID_INPUT'
      );
    }

    const config = this.readConfig();
    config.ocrModel = model.trim();
    this.writeConfig(config);
    logger.debug(`OCR model saved: ${model.trim()}`);
  }

  /**
   * Save text model preference to config file
   * @param model - The Gemini model name to use for text operations
   * @throws {ConfigError} If model name is empty or config cannot be written
   */
  static saveTextModel(model: string): void {
    // Validate input
    if (!model || typeof model !== 'string' || model.trim().length === 0) {
      throw new ConfigError(
        'Model name cannot be empty. Please provide a valid Gemini model name.',
        'INVALID_INPUT'
      );
    }

    const config = this.readConfig();
    config.textModel = model.trim();
    this.writeConfig(config);
    logger.debug(`Text model saved: ${model.trim()}`);
  }
}
