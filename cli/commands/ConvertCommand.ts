import { Command } from 'commander';
import path from 'path';
import { OCRServiceFactory } from '../../core/services/OCR/OCRServiceFactory.js';
import {
  ConfigError,
  ConfigService,
} from '../../core/services/ConfigService.js';

export function registerConvertCommand(program: Command) {
  program
    .command('convert <inputPath>')
    .description('Convert an image, pdf, or directory to markdown')
    .option(
      '--use-openai',
      'Use local OpenAI compatible provider for processing images'
    )
    .action(async (inputPath, options) => {
      try {
        ConfigService.assertProviderConfigured(!!options.useOpenai);
        const absolutePath = path.resolve(process.cwd(), inputPath);
        const service = OCRServiceFactory.getService(
          absolutePath,
          options.useOpenai
        );
        await service.extractText(absolutePath);
        console.log(`Successfully processed ${inputPath}`);
      } catch (error) {
        if (error instanceof ConfigError) {
          console.error(`Error: ${error.message}`);
        } else {
          console.error('Error processing input:', error);
        }
        process.exit(1);
      }
    });
}
