import { Command } from 'commander';
import path from 'path';
import { OCRServiceFactory } from '../../core/services/OCR/OCRServiceFactory.js';

export function registerConvertCommand(program: Command) {
  program
    .command('convert <inputPath>')
    .description('Convert an image, pdf, or directory to markdown')
    .option('--use-openai', 'Use local OpenAI compatible provider for processing images')
    .action(async (inputPath, options) => {
      try {
        const absolutePath = path.resolve(process.cwd(), inputPath);
        const service = OCRServiceFactory.getService(absolutePath, options.useOpenai);
        await service.extractText(absolutePath);
        console.log(`Successfully processed ${inputPath}`);
      } catch (error) {
        console.error('Error processing input:', error);
        process.exit(1);
      }
    });
}
