import { Command } from 'commander';
import { input, confirm } from '@inquirer/prompts';
import { GoogleGenAI } from '@google/genai';
import { ConfigService } from '../../core/services/ConfigService.js';
import { logger } from '../../core/utils/logger.js';
import ora from 'ora';

export function registerSetupCommand(program: Command) {
  program
    .command('setup')
    .description('Configure UnifiedMarkdown with your Gemini API key')
    .action(async () => {
      try {
        console.log('\n🚀 Welcome to UnifiedMarkdown Setup!\n');
        logger.info(
          'This tool uses Google Gemini AI to convert images and PDFs to Markdown.'
        );
        logger.info(
          'You can get a free API key from: https://aistudio.google.com/apikey\n'
        );

        // Check if API key already exists
        if (ConfigService.hasApiKey()) {
          const currentConfig = ConfigService.readConfig();
          if (currentConfig.apiKey) {
            const maskedKey =
              currentConfig.apiKey.substring(0, 8) +
              '...' +
              currentConfig.apiKey.substring(currentConfig.apiKey.length - 4);
            logger.info(`Current API key: ${maskedKey}`);
          } else {
            logger.info(
              'API key is set via GEMINI_API_KEY environment variable'
            );
          }

          const shouldUpdate = await confirm({
            message: 'Do you want to update your API key?',
            default: false,
          });

          if (!shouldUpdate) {
            logger.info(
              'Setup cancelled. Your current configuration is unchanged.'
            );
            return;
          }
        }

        // Prompt for API key
        const apiKey = await input({
          message: 'Enter your Gemini API key:',
          validate: (value: string) => {
            if (!value || value.trim().length === 0) {
              return 'API key cannot be empty';
            }
            if (value.length < 20) {
              return 'API key seems too short. Please check and try again.';
            }
            return true;
          },
        });

        // Test the API key
        const spinner = ora('Validating API key...').start();
        try {
          const genAI = new GoogleGenAI({ apiKey: apiKey.trim() });

          // Make a minimal test request to validate the key
          await genAI.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [{ text: 'test' }],
          });

          spinner.succeed('API key validated successfully!');
        } catch (error) {
          spinner.fail('API key validation failed');
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(
            'The API key appears to be invalid. Please check and try again.',
            error instanceof Error ? error : undefined
          );
          logger.error(`Error details: ${errorMessage}`);
          process.exit(1);
        }

        // Save the API key
        ConfigService.saveApiKey(apiKey.trim());

        console.log('');
        logger.success('Setup complete! Your API key has been saved.');
        logger.info(`Config location: ${ConfigService.getConfigPath()}`);
        console.log('');
        logger.info('You can now use UnifiedMarkdown with commands like:');
        console.log('  umd convert image.png');
        console.log('  umd convert document.pdf');
        console.log('  umd convert /path/to/directory\n');
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('User force closed')
        ) {
          logger.info('\nSetup cancelled.');
          process.exit(0);
        }
        logger.error(
          'Setup failed:',
          error instanceof Error ? error : undefined
        );
        process.exit(1);
      }
    });
}
