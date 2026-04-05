import { Command } from 'commander';
import { input, confirm } from '@inquirer/prompts';
import { GoogleGenAI } from '@google/genai';
import { ConfigService } from '../../core/services/ConfigService.js';
import { logger } from '../../core/utils/logger.js';
import { maskApiKey } from '../../core/utils/textUtils.js';
import ora from 'ora';

export function registerSetupCommand(program: Command) {
  program
    .command('setup')
    .description('Configure UnifiedMarkdown (Gemini and OpenAI compatible settings)')
    .action(async () => {
      try {
        console.log('\n🚀 Welcome to UnifiedMarkdown Setup!\n');
        logger.info(
          'This tool uses Google Gemini AI to convert images and PDFs to Markdown.'
        );
        logger.info(
          'You can get a free API key from: https://aistudio.google.com/apikey\n'
        );

        // --- Gemini Configuration ---
        console.log('── Gemini Configuration ──\n');

        // Check if API key already exists
        let skipGemini = false;
        if (ConfigService.hasGeminiApiKey()) {
          const currentConfig = ConfigService.readConfig();
          if (currentConfig.geminiApiKey) {
              logger.info(`Current API key: ${maskApiKey(currentConfig.geminiApiKey)}`);
          } else {
            logger.info(
              'API key is set via GEMINI_API_KEY environment variable'
            );
          }

          const shouldUpdate = await confirm({
            message: 'Do you want to update your Gemini API key?',
            default: false,
          });

          if (!shouldUpdate) {
            skipGemini = true;
          }
        }

        if (!skipGemini) {
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

            await genAI.models.generateContent({
              model: ConfigService.getGeminiOcrModel(),
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
          ConfigService.saveGeminiApiKey(apiKey.trim());
          logger.success('Gemini API key saved.');
        }

        // Gemini model configuration
        const currentOcrModel = ConfigService.getGeminiOcrModel();
        const currentTextModel = ConfigService.getGeminiTextModel();
        logger.info(`Current Gemini OCR model: ${currentOcrModel}`);
        logger.info(`Current Gemini text model: ${currentTextModel}`);

        const updateModels = await confirm({
          message: 'Do you want to change the Gemini model names?',
          default: false,
        });

        if (updateModels) {
          const ocrModel = await input({
            message: 'Gemini OCR/Vision model:',
            default: currentOcrModel,
          });
          ConfigService.saveGeminiOcrModel(ocrModel.trim());

          const textModel = await input({
            message: 'Gemini Text model:',
            default: currentTextModel,
          });
          ConfigService.saveGeminiTextModel(textModel.trim());
          logger.success('Gemini models updated.');
        }

        // --- OpenAI Compatible Configuration ---
        console.log('\n── OpenAI Compatible Configuration (Optional) ──\n');
        logger.info(
          'You can optionally configure an OpenAI-compatible endpoint (e.g., LM Studio, Ollama).'
        );
        logger.info(
          'This is used as an alternative provider for image conversion.\n'
        );

        const currentEndpoint = ConfigService.getOpenaiEndpoint();
        const currentOpenaiKey = ConfigService.getOpenaiApiKey();
        const currentOpenaiOcrModel = ConfigService.getOpenaiOcrModel();
        const currentOpenaiTextModel = ConfigService.getOpenaiTextModel();

        if (currentEndpoint) {
          logger.info(`Current endpoint: ${currentEndpoint}`);
          if (currentOpenaiKey) {
            logger.info(`Current API key: ${maskApiKey(currentOpenaiKey)}`);
          }
          logger.info(`Current OCR model: ${currentOpenaiOcrModel}`);
          logger.info(`Current text model: ${currentOpenaiTextModel}`);
        }

        const configureOpenAI = await confirm({
          message: currentEndpoint
            ? 'Do you want to update your OpenAI compatible settings?'
            : 'Do you want to configure an OpenAI compatible endpoint?',
          default: false,
        });

        if (configureOpenAI) {
          const endpoint = await input({
            message: 'Endpoint URL (e.g., http://127.0.0.1:1234/v1):',
            default: currentEndpoint || '',
            validate: (value: string) => {
              if (!value || value.trim().length === 0) {
                return 'Endpoint URL cannot be empty';
              }
              return true;
            },
          });
          ConfigService.saveOpenaiEndpoint(endpoint.trim());

          const openaiKey = await input({
            message: 'API key (leave empty if not required):',
            default: '',
          });
          if (openaiKey.trim()) {
            ConfigService.saveOpenaiApiKey(openaiKey.trim());
          }

          const ocrModel = await input({
            message: 'OCR/Vision model:',
            default: currentOpenaiOcrModel,
          });
          ConfigService.saveOpenaiOcrModel(ocrModel.trim());

          const textModel = await input({
            message: 'Text model:',
            default: currentOpenaiTextModel,
          });
          ConfigService.saveOpenaiTextModel(textModel.trim());

          logger.success('OpenAI compatible settings saved.');
        }

        console.log('');
        logger.success('Setup complete!');
        logger.info(`Config location: ${ConfigService.getConfigPath()}`);
        console.log('');
        logger.info('You can now use UnifiedMarkdown with commands like:');
        console.log('  umd convert image.png');
        console.log('  umd convert document.pdf');
        console.log('  umd convert /path/to/directory');
        console.log('  umd convert image.png --use-openai\n');
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
