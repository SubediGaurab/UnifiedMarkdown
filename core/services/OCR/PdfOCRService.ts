import { logger } from '../../utils/logger.js';

import { IOCRService } from '../../interfaces/IOCRService.js';
import { GeminiSingleFileOCRService } from '../AI/GeminiSingleFileOCRService.js';
import { MarkdownSaverService } from '../MarkdownSaverService.js';

/**
 * OCR service implementation for PDF files using Gemini AI
 */
export class PdfOCRService implements IOCRService {
  private geminiService: GeminiSingleFileOCRService;
  private markdownSaver: MarkdownSaverService;

  /**
   * Creates a new PdfOCRService instance
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
   * Extract text from a PDF using Gemini API and save to markdown file
   */
  async extractText(pdfPath: string): Promise<void> {
    try {
      logger.info(`Starting PDF OCR for ${pdfPath}`);
      const mimeType = 'application/pdf';

      // Extract text using Gemini
      let text: string;
      try {
        text = await this.geminiService.extractText(pdfPath, mimeType);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          `Failed to extract text from PDF ${pdfPath}: ${errorMessage}`
        );
        throw new Error(
          `Gemini API extraction failed for ${pdfPath}: ${errorMessage}`
        );
      }

      // Save to file using MarkdownSaverService
      try {
        this.markdownSaver.saveMarkdown(pdfPath, text);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(`Failed to save markdown for ${pdfPath}: ${errorMessage}`);
        throw new Error(`Markdown save failed for ${pdfPath}: ${errorMessage}`);
      }

      logger.info(`Successfully processed ${pdfPath}`);
    } catch (error) {
      // Re-throw if already a detailed error from above
      if (error instanceof Error && error.message.includes('failed for')) {
        throw error;
      }
      // Otherwise, wrap with context
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`PDF OCR failed for ${pdfPath}: ${errorMessage}`);
      throw new Error(
        `PDF OCR processing failed for ${pdfPath}: ${errorMessage}`
      );
    }
  }
}
