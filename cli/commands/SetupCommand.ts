import { Command } from 'commander';
import { input, confirm } from '@inquirer/prompts';
import { GoogleGenAI } from '@google/genai';
import {
  ConfigService,
  ENV_KEYS,
  EnvKey,
} from '../../core/services/ConfigService.js';
import { logger } from '../../core/utils/logger.js';
import { maskApiKey } from '../../core/utils/textUtils.js';
import ora from 'ora';

const notEmpty = (label: string) => (value: string) =>
  value && value.trim().length > 0 ? true : `${label} cannot be empty`;

/** Ask for a value. The current value (if any) is offered; nothing else is. */
async function askValue(key: EnvKey, message: string): Promise<string> {
  const current = ConfigService.getOptional(key);
  const value = await input({
    message: `${message} (${key}):`,
    default: current,
    validate: notEmpty(key),
  });
  return value.trim();
}

export function registerSetupCommand(program: Command) {
  program
    .command('setup')
    .description(
      `Write UnifiedMarkdown settings to ${ConfigService.getEnvPath()}`
    )
    .action(async () => {
      try {
        console.log('\n🚀 Welcome to UnifiedMarkdown Setup!\n');
        logger.info(`All settings live in ${ConfigService.getEnvPath()}.`);
        logger.info(
          'There are no built-in default models: you choose every model here.'
        );
        logger.info(
          'Get a Gemini API key from: https://aistudio.google.com/apikey\n'
        );

        // --- Gemini ---
        console.log('── Gemini ──\n');

        let apiKey = ConfigService.getOptional(ENV_KEYS.geminiApiKey);
        let updateKey = !apiKey;
        if (apiKey) {
          logger.info(`Current API key: ${maskApiKey(apiKey)}`);
          updateKey = await confirm({
            message: 'Update the Gemini API key?',
            default: false,
          });
        }
        if (updateKey) {
          apiKey = (
            await input({
              message: `Gemini API key (${ENV_KEYS.geminiApiKey}):`,
              validate: notEmpty('API key'),
            })
          ).trim();
        }

        const ocrModel = await askValue(
          ENV_KEYS.geminiOcrModel,
          'Gemini OCR/vision model'
        );
        const textModel = await askValue(
          ENV_KEYS.geminiTextModel,
          'Gemini text model'
        );

        if (updateKey) {
          const spinner = ora('Validating API key...').start();
          try {
            const genAI = new GoogleGenAI({ apiKey: apiKey! });
            await genAI.models.generateContent({
              model: textModel,
              contents: [{ text: 'test' }],
            });
            spinner.succeed('API key validated.');
          } catch (error) {
            spinner.fail('API key validation failed');
            logger.error(
              `Error details: ${error instanceof Error ? error.message : String(error)}`
            );
            process.exit(1);
          }
        }

        ConfigService.writeEnv({
          [ENV_KEYS.geminiApiKey]: apiKey,
          [ENV_KEYS.geminiOcrModel]: ocrModel,
          [ENV_KEYS.geminiTextModel]: textModel,
        });
        logger.success('Gemini settings saved.');

        // --- OpenAI compatible (optional, only used with --use-openai) ---
        console.log(
          '\n── OpenAI compatible endpoint (optional, used only with --use-openai) ──\n'
        );
        const hasOpenai = !!ConfigService.getOptional(ENV_KEYS.openaiBaseUrl);
        const configureOpenAI = await confirm({
          message: hasOpenai
            ? 'Update the OpenAI compatible settings?'
            : 'Configure an OpenAI compatible endpoint (e.g., LM Studio, Ollama)?',
          default: false,
        });

        if (configureOpenAI) {
          const baseUrl = await askValue(
            ENV_KEYS.openaiBaseUrl,
            'Endpoint URL, e.g. http://127.0.0.1:1234/v1'
          );
          const currentKey = ConfigService.getOptional(ENV_KEYS.openaiApiKey);
          if (currentKey)
            logger.info(`Current API key: ${maskApiKey(currentKey)}`);
          const openaiKey = (
            await input({
              message: `API key (${ENV_KEYS.openaiApiKey}; any value if your server needs none):`,
              default: currentKey,
              validate: notEmpty(ENV_KEYS.openaiApiKey),
            })
          ).trim();
          const openaiOcr = await askValue(
            ENV_KEYS.openaiOcrModel,
            'OCR/vision model'
          );
          const openaiText = await askValue(
            ENV_KEYS.openaiTextModel,
            'Text model'
          );
          ConfigService.writeEnv({
            [ENV_KEYS.openaiBaseUrl]: baseUrl,
            [ENV_KEYS.openaiApiKey]: openaiKey,
            [ENV_KEYS.openaiOcrModel]: openaiOcr,
            [ENV_KEYS.openaiTextModel]: openaiText,
          });
          logger.success('OpenAI compatible settings saved.');
        }

        console.log('');
        logger.success(
          `Setup complete. Settings file: ${ConfigService.getEnvPath()}`
        );
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
