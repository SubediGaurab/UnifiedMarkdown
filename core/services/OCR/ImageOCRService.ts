import { logger } from '../../utils/logger.js';
import { getMimeTypeFromExtension } from '../../utils/mimeTypes.js';

import { IOCRService } from '../../interfaces/IOCRService.js';
import { GeminiSingleFileOCRService } from '../AI/GeminiSingleFileOCRService.js';
import { MarkdownSaverService } from '../MarkdownSaverService.js';

/**
 * OCR service implementation using Gemini AI for Images
 */
export class ImageOCRService implements IOCRService {
  private geminiService: GeminiSingleFileOCRService;
  private markdownSaver: MarkdownSaverService;

  /**
   * Creates a new ImageOCRService instance
   * @param geminiService - Optional Gemini service instance for dependency injection (defaults to new instance)
   * @param markdownSaver - Optional markdown saver instance for dependency injection (defaults to new instance)
   */
  public constructor(
    geminiService?: GeminiSingleFileOCRService,
    markdownSaver?: MarkdownSaverService
  ) {
    this.geminiService = geminiService ?? new GeminiSingleFileOCRService();
    this.markdownSaver = markdownSaver ?? new MarkdownSaverService();
  }

  /**
   * Extract text from image using Gemini API and save to markdown file
   */
  async extractText(imagePath: string): Promise<void> {
    try {
      logger.info(`Starting OCR for ${imagePath}`);

      const mimeType = getMimeTypeFromExtension(imagePath);

      // Extract text using Gemini
      let text: string;
      try {
        text = await this.geminiService.extractText(imagePath, mimeType);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          `Failed to extract text from image ${imagePath}: ${errorMessage}`
        );
        throw new Error(
          `Gemini API extraction failed for ${imagePath}: ${errorMessage}`
        );
      }

      // Save to file using MarkdownSaverService
      try {
        this.markdownSaver.saveMarkdown(imagePath, text);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          `Failed to save markdown for ${imagePath}: ${errorMessage}`
        );
        throw new Error(
          `Markdown save failed for ${imagePath}: ${errorMessage}`
        );
      }

      logger.info(`Successfully processed ${imagePath}`);
    } catch (error) {
      // Re-throw if already a detailed error from above
      if (error instanceof Error && error.message.includes('failed for')) {
        throw error;
      }
      // Otherwise, wrap with context
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Image OCR failed for ${imagePath}: ${errorMessage}`);
      throw new Error(
        `Image OCR processing failed for ${imagePath}: ${errorMessage}`
      );
    }
  }
}
