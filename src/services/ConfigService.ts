import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger.js';
import { UmdConfig } from '../interfaces/IConfig.js';

export class ConfigService {
    private static readonly CONFIG_DIR = path.join(os.homedir(), '.umd');
    private static readonly CONFIG_FILE = path.join(
        ConfigService.CONFIG_DIR,
        'config.json'
    );

    /**
     * Get the Gemini API key from config file or environment variable
     * Priority: config file -> environment variable -> throw error
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
        throw new Error(
            'No Gemini API key found. Please run "umd setup" to configure your API key, ' +
                'or set the GEMINI_API_KEY environment variable.'
        );
    }

    /**
     * Read the config file, returns empty config if file doesn't exist
     */
    static readConfig(): UmdConfig {
        try {
            if (!fs.existsSync(ConfigService.CONFIG_FILE)) {
                return {};
            }

            const content = fs.readFileSync(ConfigService.CONFIG_FILE, 'utf-8');
            return JSON.parse(content) as UmdConfig;
        } catch (error) {
            logger.warning(
                `Failed to read config file: ${error}. Using empty config.`
            );
            return {};
        }
    }

    /**
     * Write the config file, creates directory if needed
     */
    static writeConfig(config: UmdConfig): void {
        try {
            // Create config directory if it doesn't exist
            if (!fs.existsSync(ConfigService.CONFIG_DIR)) {
                fs.mkdirSync(ConfigService.CONFIG_DIR, { recursive: true });
                logger.debug(`Created config directory: ${ConfigService.CONFIG_DIR}`);
            }

            // Write config file
            fs.writeFileSync(
                ConfigService.CONFIG_FILE,
                JSON.stringify(config, null, 2),
                'utf-8'
            );
            logger.debug(`Config saved to ${ConfigService.CONFIG_FILE}`);
        } catch (error) {
            throw new Error(`Failed to write config file: ${error}`);
        }
    }

    /**
     * Save API key to config file
     */
    static saveApiKey(apiKey: string): void {
        const config = this.readConfig();
        config.apiKey = apiKey;
        this.writeConfig(config);
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
}
