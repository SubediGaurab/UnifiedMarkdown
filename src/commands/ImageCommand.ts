import { Command } from 'commander';
import path from 'path';
import { ImageOCRService } from '../services/OCR/ImageOCRService.js';

export function registerImageCommand(program: Command) {
  program
    .command('image <imagePath>')
    .description('Convert an image to markdown')
    .action(async (imagePath) => {
      try {
        const absolutePath = path.resolve(process.cwd(), imagePath);
        const imageOCRService = new ImageOCRService();
        await imageOCRService.extractText(absolutePath);
        // Output is already handled by the service (saved to file)
        // We can optionally log a success message here if needed, but the service logs it too.
        console.log(`Successfully converted ${imagePath} to ${imagePath}.md`);
      } catch (error) {
        console.error('Error converting image:', error);
        process.exit(1);
      }
    });
}
